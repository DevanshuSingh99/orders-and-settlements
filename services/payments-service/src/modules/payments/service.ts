/**
 * Payment business logic - this is the core of the whole assignment.
 *
 * The critical invariant is: totalPaid <= orderTotal, even when two
 * payment requests for the same order arrive at the same instant. See
 * repository.ts `applyGuardedPayment` for exactly how the database
 * guarantees this; this file orchestrates that guard, idempotency, and
 * audit logging around it.
 */
import {
  AppError,
  AuditAction,
  ErrorCode,
  InvalidMoneyValueError,
  fromCents,
  formatCents,
  toCents,
  validatePaymentAmount,
} from '@oas/shared-domain';
import { writeAudit } from '../../audit/writeAudit';
import { pool } from '../../db/pool';
import * as repo from './repository';
import { serializeOrderSnapshot, serializePayment } from './serializer';
import type { RecordPaymentInput } from './schemas';

export interface PaymentContext {
  userId: string;
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export interface RecordPaymentResult {
  payment: ReturnType<typeof serializePayment>;
  order: ReturnType<typeof serializeOrderSnapshot>;
  /** True if this call replayed a previous request via the idempotency key rather than creating a new payment. */
  replayed: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === repo.UNIQUE_VIOLATION;
}

/** Maps shared validatePaymentAmount failures to the existing API error contracts. */
function throwForInvalidPaymentAmount(
  amountCents: number,
  alreadyPaidCents: number,
  orderTotalCents: number,
): void {
  const validation = validatePaymentAmount({ amountCents, alreadyPaidCents, orderTotalCents });
  if (validation.ok) return;

  if (amountCents < 1) {
    throw new AppError(ErrorCode.INVALID_PAYMENT_AMOUNT, 'Payment amount must be at least $0.01.');
  }

  const remainingCents = validation.remainingCents ?? 0;
  throw new AppError(
    ErrorCode.PAYMENT_EXCEEDS_REMAINING_BALANCE,
    `Payment of ${formatCents(amountCents)} exceeds the remaining balance of ${formatCents(remainingCents)}.`,
    {
      requestedAmount: fromCents(amountCents),
      remainingAmount: fromCents(remainingCents),
      maxAllowedAmount: fromCents(remainingCents),
    },
  );
}

async function buildIdempotentReplayResult(
  userId: string,
  orderId: string,
  existing: repo.PaymentRow,
): Promise<RecordPaymentResult> {
  if (existing.order_id !== orderId) {
    // The same key was reused for a different order - this is a client bug,
    // not a legitimate retry, so we reject it rather than silently
    // returning a payment for the wrong order.
    throw new AppError(
      ErrorCode.DUPLICATE_IDEMPOTENCY_KEY,
      'This idempotency key was already used for a different order.',
    );
  }

  const order = await repo.findOrderSnapshotForUser(pool, userId, orderId);
  if (!order) {
    throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
  }

  return { payment: serializePayment(existing), order: serializeOrderSnapshot(order), replayed: true };
}

export async function recordPayment(
  orderId: string,
  input: RecordPaymentInput,
  idempotencyKey: string | null,
  ctx: PaymentContext,
): Promise<RecordPaymentResult> {
  // Idempotency short-circuit (checked BEFORE opening a transaction): if
  // this exact (user, key) pair already produced a payment, return it
  // as-is rather than creating a duplicate - see
  // docs/implementation-plan.md section 12.
  if (idempotencyKey) {
    const existing = await repo.findPaymentByIdempotencyKey(ctx.userId, idempotencyKey);
    if (existing) {
      return buildIdempotentReplayResult(ctx.userId, orderId, existing);
    }
  }

  let amountCents: number;
  try {
    amountCents = toCents(input.amount);
  } catch (err) {
    if (err instanceof InvalidMoneyValueError) {
      throw new AppError(ErrorCode.INVALID_PAYMENT_AMOUNT, 'Payment amount must be a valid dollar amount with at most 2 decimal places.');
    }
    throw err;
  }

  // Cheap min-amount check before opening a transaction. orderTotal equals
  // amount (or 1) so only amountCents < 1 can fail here.
  throwForInvalidPaymentAmount(amountCents, 0, Math.max(amountCents, 1));

  try {
    const { payment, order } = await repo.withTransaction(async (client) => {
      const snapshot = await repo.findOrderSnapshotForUser(client, ctx.userId, orderId);
      if (!snapshot) {
        throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
      }

      // Shared domain rules (min amount + remaining balance) before the
      // guarded UPDATE; the UPDATE itself remains the concurrency backstop.
      throwForInvalidPaymentAmount(
        amountCents,
        Number(snapshot.paid_amount_cents),
        Number(snapshot.total_cents),
      );

      // The guard: this UPDATE only matches (and thus only succeeds) if
      // the new total still fits under the order total, evaluated
      // atomically by Postgres at the moment the row lock is acquired.
      const updatedOrder = await repo.applyGuardedPayment(client, {
        orderId,
        userId: ctx.userId,
        amountCents,
      });

      if (!updatedOrder) {
        // Race: a concurrent payment took the remaining balance after our
        // pre-check. Re-read and return the same overpay error contract.
        const fresh = await repo.findOrderSnapshotForUser(client, ctx.userId, orderId);
        if (!fresh) {
          throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
        }

        const remainingCents = Math.max(
          Number(fresh.total_cents) - Number(fresh.paid_amount_cents),
          0,
        );
        throw new AppError(
          ErrorCode.PAYMENT_EXCEEDS_REMAINING_BALANCE,
          `Payment of ${formatCents(amountCents)} exceeds the remaining balance of ${formatCents(remainingCents)}.`,
          {
            requestedAmount: fromCents(amountCents),
            remainingAmount: fromCents(remainingCents),
            maxAllowedAmount: fromCents(remainingCents),
          },
        );
      }

      // Insert may throw a unique_violation if a concurrent request with
      // the SAME idempotency key won the race between our lookup above and
      // this insert - handled in the outer catch below by replaying it.
      const insertedPayment = await repo.insertPayment(client, {
        userId: ctx.userId,
        orderId,
        amountCents,
        paymentDate: input.paymentDate,
        note: input.note ?? null,
        idempotencyKey,
      });

      await writeAudit(
        {
          actorId: ctx.userId,
          action: AuditAction.PAYMENT_RECORDED,
          entityType: 'payment',
          entityId: insertedPayment.id,
          requestId: ctx.requestId,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
          metadata: {
            orderId,
            amountCents,
            newPaidAmountCents: Number(updatedOrder.paid_amount_cents),
            orderTotalCents: Number(updatedOrder.total_cents),
          },
        },
        client,
      );

      return { payment: insertedPayment, order: updatedOrder };
    });

    return { payment: serializePayment(payment), order: serializeOrderSnapshot(order), replayed: false };
  } catch (err) {
    if (isUniqueViolation(err) && idempotencyKey) {
      // Lost a race with a concurrent identical request. The transaction
      // above was fully rolled back (including the paid_amount_cents
      // increment), so the other request's success is the only one that
      // counts - fetch and return it exactly as if we had found it up front.
      const existing = await repo.findPaymentByIdempotencyKey(ctx.userId, idempotencyKey);
      if (existing) {
        return buildIdempotentReplayResult(ctx.userId, orderId, existing);
      }
    }

    if (err instanceof AppError && err.code === ErrorCode.PAYMENT_EXCEEDS_REMAINING_BALANCE) {
      // The failed attempt itself is a financially meaningful event, so we
      // record it even though no payment was created - in its own
      // transaction, since the one above was rolled back.
      await writeAudit({
        actorId: ctx.userId,
        action: AuditAction.PAYMENT_REJECTED,
        entityType: 'order',
        entityId: orderId,
        requestId: ctx.requestId,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
        metadata: { reason: 'exceeds_remaining_balance', requestedAmountCents: amountCents, details: err.details },
      });
    }

    throw err;
  }
}

export async function listPayments(orderId: string, ctx: PaymentContext) {
  const order = await repo.findOrderSnapshotForUser(pool, ctx.userId, orderId);
  if (!order) {
    throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
  }

  const payments = await repo.listPaymentsForOrder(ctx.userId, orderId);
  return payments.map(serializePayment);
}

export async function getPayment(orderId: string, paymentId: string, ctx: PaymentContext) {
  const payment = await repo.findPaymentForUser(ctx.userId, orderId, paymentId);
  if (!payment) {
    throw new AppError(ErrorCode.PAYMENT_NOT_FOUND, 'Payment not found.');
  }
  return serializePayment(payment);
}

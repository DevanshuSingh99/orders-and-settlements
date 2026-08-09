/**
 * Refund business logic — mirrors recordPayment, but decrements
 * paid_amount_cents under a concurrency-safe guard (paid - n >= 0).
 */
import {
  AppError,
  AuditAction,
  ErrorCode,
  InvalidMoneyValueError,
  fromCents,
  formatCents,
  toCents,
  validateRefundAmount,
} from '@oas/shared-domain';
import { writeAudit } from '../../audit/writeAudit';
import { pool } from '../../db/pool';
import * as repo from './repository';
import { serializeOrderSnapshot, serializeRefund } from './serializer';
import type { RecordRefundInput } from './schemas';

export interface RefundContext {
  userId: string;
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export interface RecordRefundResult {
  refund: ReturnType<typeof serializeRefund>;
  order: ReturnType<typeof serializeOrderSnapshot>;
  /** True if this call replayed a previous request via the idempotency key. */
  replayed: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === repo.UNIQUE_VIOLATION;
}

/** Maps shared validateRefundAmount failures to the API error contracts. */
function throwForInvalidRefundAmount(amountCents: number, paidCents: number): void {
  const validation = validateRefundAmount({ amountCents, paidCents });
  if (validation.ok) return;

  if (amountCents < 1) {
    throw new AppError(ErrorCode.INVALID_REFUND_AMOUNT, 'Refund amount must be at least $0.01.');
  }

  const maxRefundableCents = validation.maxRefundableCents ?? 0;
  throw new AppError(
    ErrorCode.REFUND_EXCEEDS_AMOUNT_PAID,
    `Refund of ${formatCents(amountCents)} exceeds the amount paid of ${formatCents(maxRefundableCents)}.`,
    {
      requestedAmount: fromCents(amountCents),
      paidAmount: fromCents(maxRefundableCents),
      maxAllowedAmount: fromCents(maxRefundableCents),
    },
  );
}

async function buildIdempotentReplayResult(
  userId: string,
  orderId: string,
  existing: repo.RefundRow,
): Promise<RecordRefundResult> {
  if (existing.order_id !== orderId) {
    throw new AppError(
      ErrorCode.DUPLICATE_IDEMPOTENCY_KEY,
      'This idempotency key was already used for a different order.',
    );
  }

  const order = await repo.findOrderSnapshotForUser(pool, userId, orderId);
  if (!order) {
    throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
  }

  return { refund: serializeRefund(existing), order: serializeOrderSnapshot(order), replayed: true };
}

export async function recordRefund(
  orderId: string,
  input: RecordRefundInput,
  idempotencyKey: string | null,
  ctx: RefundContext,
): Promise<RecordRefundResult> {
  if (idempotencyKey) {
    const existing = await repo.findRefundByIdempotencyKey(ctx.userId, idempotencyKey);
    if (existing) {
      return buildIdempotentReplayResult(ctx.userId, orderId, existing);
    }
  }

  let amountCents: number;
  try {
    amountCents = toCents(input.amount);
  } catch (err) {
    if (err instanceof InvalidMoneyValueError) {
      throw new AppError(ErrorCode.INVALID_REFUND_AMOUNT, 'Refund amount must be a valid dollar amount with at most 2 decimal places.');
    }
    throw err;
  }

  // Cheap min-amount check before opening a transaction.
  throwForInvalidRefundAmount(amountCents, Math.max(amountCents, 1));

  try {
    const { refund, order } = await repo.withTransaction(async (client) => {
      const snapshot = await repo.findOrderSnapshotForUser(client, ctx.userId, orderId);
      if (!snapshot) {
        throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
      }

      throwForInvalidRefundAmount(amountCents, Number(snapshot.paid_amount_cents));

      const updatedOrder = await repo.applyGuardedRefund(client, {
        orderId,
        userId: ctx.userId,
        amountCents,
      });

      if (!updatedOrder) {
        // Race: a concurrent refund took the paid balance after our pre-check.
        const fresh = await repo.findOrderSnapshotForUser(client, ctx.userId, orderId);
        if (!fresh) {
          throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
        }

        const paidCents = Math.max(Number(fresh.paid_amount_cents), 0);
        throw new AppError(
          ErrorCode.REFUND_EXCEEDS_AMOUNT_PAID,
          `Refund of ${formatCents(amountCents)} exceeds the amount paid of ${formatCents(paidCents)}.`,
          {
            requestedAmount: fromCents(amountCents),
            paidAmount: fromCents(paidCents),
            maxAllowedAmount: fromCents(paidCents),
          },
        );
      }

      const insertedRefund = await repo.insertRefund(client, {
        userId: ctx.userId,
        orderId,
        amountCents,
        refundDate: input.refundDate,
        note: input.note ?? null,
        idempotencyKey,
      });

      await writeAudit(
        {
          actorId: ctx.userId,
          action: AuditAction.PAYMENT_REFUNDED,
          entityType: 'refund',
          entityId: insertedRefund.id,
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

      return { refund: insertedRefund, order: updatedOrder };
    });

    return { refund: serializeRefund(refund), order: serializeOrderSnapshot(order), replayed: false };
  } catch (err) {
    if (isUniqueViolation(err) && idempotencyKey) {
      const existing = await repo.findRefundByIdempotencyKey(ctx.userId, idempotencyKey);
      if (existing) {
        return buildIdempotentReplayResult(ctx.userId, orderId, existing);
      }
    }

    throw err;
  }
}

export async function listRefunds(orderId: string, ctx: RefundContext) {
  const order = await repo.findOrderSnapshotForUser(pool, ctx.userId, orderId);
  if (!order) {
    throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found.');
  }

  const refunds = await repo.listRefundsForOrder(ctx.userId, orderId);
  return refunds.map(serializeRefund);
}

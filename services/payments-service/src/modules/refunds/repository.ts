/**
 * Data access for refunds, plus the guarded atomic decrement of
 * `orders.orders.paid_amount_cents` that makes concurrent over-refunds
 * impossible (mirror of applyGuardedPayment in payments/repository.ts).
 */
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';
import type { OrderSnapshot } from '../payments/repository';
import { findOrderSnapshotForUser, withTransaction, UNIQUE_VIOLATION } from '../payments/repository';

export type { OrderSnapshot };
export { findOrderSnapshotForUser, withTransaction, UNIQUE_VIOLATION };

export interface RefundRow {
  id: string;
  user_id: string;
  order_id: string;
  amount_cents: string;
  refund_date: string;
  note: string | null;
  idempotency_key: string | null;
  created_at: Date;
}

/**
 * Decrements paid_amount_cents only when the result would stay >= 0.
 * Concurrent refunds serialize on the order row lock; the second UPDATE
 * re-evaluates the WHERE clause after the first commits.
 */
export async function applyGuardedRefund(
  client: PoolClient,
  params: { orderId: string; userId: string; amountCents: number },
): Promise<OrderSnapshot | null> {
  const { rows } = await client.query<OrderSnapshot>(
    `UPDATE orders.orders
        SET paid_amount_cents = paid_amount_cents - $3, updated_at = now()
      WHERE id = $1 AND user_id = $2
        AND paid_amount_cents - $3 >= 0
      RETURNING id, user_id, total_cents, paid_amount_cents, due_date`,
    [params.orderId, params.userId, params.amountCents],
  );
  return rows[0] ?? null;
}

export async function insertRefund(
  client: PoolClient,
  params: {
    userId: string;
    orderId: string;
    amountCents: number;
    refundDate: string;
    note: string | null;
    idempotencyKey: string | null;
  },
): Promise<RefundRow> {
  const { rows } = await client.query<RefundRow>(
    `INSERT INTO refunds (user_id, order_id, amount_cents, refund_date, note, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [params.userId, params.orderId, params.amountCents, params.refundDate, params.note, params.idempotencyKey],
  );
  return rows[0];
}

export async function findRefundByIdempotencyKey(userId: string, idempotencyKey: string): Promise<RefundRow | null> {
  const { rows } = await pool.query<RefundRow>(
    'SELECT * FROM refunds WHERE user_id = $1 AND idempotency_key = $2',
    [userId, idempotencyKey],
  );
  return rows[0] ?? null;
}

export async function listRefundsForOrder(userId: string, orderId: string): Promise<RefundRow[]> {
  const { rows } = await pool.query<RefundRow>(
    'SELECT * FROM refunds WHERE user_id = $1 AND order_id = $2 ORDER BY refund_date DESC, created_at DESC',
    [userId, orderId],
  );
  return rows;
}

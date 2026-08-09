/**
 * Data access for payments, plus the one deliberate cross-schema write:
 * the guarded atomic UPDATE against `orders.orders.paid_amount_cents`
 * that makes concurrent overpayment impossible (see service.ts for the
 * full transaction and docs/implementation-plan.md section 7).
 */
import type { PoolClient } from 'pg';
import { pool } from '../../db/pool';

export interface OrderSnapshot {
  id: string;
  user_id: string;
  total_cents: string;
  paid_amount_cents: string;
  due_date: string;
}

export interface PaymentRow {
  id: string;
  user_id: string;
  order_id: string;
  amount_cents: string;
  payment_date: string;
  note: string | null;
  idempotency_key: string | null;
  created_at: Date;
}

/** Postgres unique_violation error code (23505). */
export const UNIQUE_VIOLATION = '23505';

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Plain read, used to build a helpful error message after the guarded update below returns 0 rows, and to render the order snapshot in API responses. */
export async function findOrderSnapshotForUser(
  client: PoolClient | typeof pool,
  userId: string,
  orderId: string,
): Promise<OrderSnapshot | null> {
  const { rows } = await client.query<OrderSnapshot>(
    'SELECT id, user_id, total_cents, paid_amount_cents, due_date FROM orders.orders WHERE id = $1 AND user_id = $2',
    [orderId, userId],
  );
  return rows[0] ?? null;
}

/**
 * The core concurrency-safety mechanism (Invariant 1: totalPaid <=
 * orderTotal). This single UPDATE statement is the ONLY place that
 * increments `paid_amount_cents`, and it only succeeds if, at the moment
 * Postgres applies it, the new total still fits under `total_cents`.
 *
 * Postgres takes a row-level lock on the matched order row for the
 * duration of the transaction. If two payments race for the same order,
 * the second one's UPDATE blocks until the first commits or rolls back,
 * then re-evaluates the WHERE clause against the now-updated row - so it
 * is impossible for both to succeed if their combined amount would
 * overpay the order. This holds even though our two services never
 * coordinate directly; the guarantee comes entirely from the database.
 */
export async function applyGuardedPayment(
  client: PoolClient,
  params: { orderId: string; userId: string; amountCents: number },
): Promise<OrderSnapshot | null> {
  const { rows } = await client.query<OrderSnapshot>(
    `UPDATE orders.orders
        SET paid_amount_cents = paid_amount_cents + $3, updated_at = now()
      WHERE id = $1 AND user_id = $2
        AND paid_amount_cents + $3 <= total_cents
      RETURNING id, user_id, total_cents, paid_amount_cents, due_date`,
    [params.orderId, params.userId, params.amountCents],
  );
  return rows[0] ?? null;
}

export async function insertPayment(
  client: PoolClient,
  params: {
    userId: string;
    orderId: string;
    amountCents: number;
    paymentDate: string;
    note: string | null;
    idempotencyKey: string | null;
  },
): Promise<PaymentRow> {
  const { rows } = await client.query<PaymentRow>(
    `INSERT INTO payments (user_id, order_id, amount_cents, payment_date, note, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [params.userId, params.orderId, params.amountCents, params.paymentDate, params.note, params.idempotencyKey],
  );
  return rows[0];
}

export async function findPaymentByIdempotencyKey(userId: string, idempotencyKey: string): Promise<PaymentRow | null> {
  const { rows } = await pool.query<PaymentRow>(
    'SELECT * FROM payments WHERE user_id = $1 AND idempotency_key = $2',
    [userId, idempotencyKey],
  );
  return rows[0] ?? null;
}

export async function listPaymentsForOrder(userId: string, orderId: string): Promise<PaymentRow[]> {
  const { rows } = await pool.query<PaymentRow>(
    'SELECT * FROM payments WHERE user_id = $1 AND order_id = $2 ORDER BY payment_date DESC, created_at DESC',
    [userId, orderId],
  );
  return rows;
}

export async function findPaymentForUser(userId: string, orderId: string, paymentId: string): Promise<PaymentRow | null> {
  const { rows } = await pool.query<PaymentRow>(
    'SELECT * FROM payments WHERE id = $1 AND order_id = $2 AND user_id = $3',
    [paymentId, orderId, userId],
  );
  return rows[0] ?? null;
}

/**
 * Test helper: inserts an order directly into orders.orders. Payments-
 * service's tests exercise the payments API against real orders without
 * depending on orders-service being up - the two services communicate only
 * through the shared `orders.orders` table for the paid_amount_cents
 * aggregate (see docs/implementation-plan.md section 7).
 */
import { pool } from '../src/db/pool';

export async function createTestOrder(params: {
  userId: string;
  totalCents: number;
  dueDateOffsetDays?: number;
}): Promise<string> {
  const dueDate = new Date();
  dueDate.setUTCDate(dueDate.getUTCDate() + (params.dueDateOffsetDays ?? 7));

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orders.orders (user_id, customer, due_date, total_cents)
     VALUES ($1, 'Test Customer', $2, $3)
     RETURNING id`,
    [params.userId, dueDate.toISOString().slice(0, 10), params.totalCents],
  );
  return rows[0].id;
}

export async function getOrderPaidAmountCents(orderId: string): Promise<number> {
  const { rows } = await pool.query<{ paid_amount_cents: string }>(
    'SELECT paid_amount_cents FROM orders.orders WHERE id = $1',
    [orderId],
  );
  return Number(rows[0]?.paid_amount_cents ?? 0);
}

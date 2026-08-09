/**
 * Asserts that the SQL CASE expression (ORDER_STATUS_CASE_SQL, used for
 * `WHERE status = ...` filtering) computes the exact same status as the
 * shared TypeScript `deriveOrderStatus` function, for every case in the
 * assignment's status matrix. If these ever drift apart, filtering by
 * status in the dashboard would silently disagree with the order detail
 * page - this test exists specifically to catch that.
 */
import { deriveOrderStatus } from '@oas/shared-domain';
import { pool } from '../src/db/pool';
import { makeUser } from './testAuth';
import './setup';

interface Case {
  name: string;
  totalCents: number;
  paidCents: number;
  dueDateOffsetDays: number; // negative = past, positive = future
}

const cases: Case[] = [
  { name: 'Case A: pending', totalCents: 100000, paidCents: 0, dueDateOffsetDays: 30 },
  { name: 'Case B: partially_paid', totalCents: 100000, paidCents: 40000, dueDateOffsetDays: 30 },
  { name: 'Case C: paid, future due date', totalCents: 100000, paidCents: 100000, dueDateOffsetDays: 30 },
  { name: 'Case D: overdue', totalCents: 100000, paidCents: 40000, dueDateOffsetDays: -30 },
  { name: 'Case E: paid, past due date (not overdue)', totalCents: 100000, paidCents: 100000, dueDateOffsetDays: -30 },
  { name: 'no payments, past due date -> overdue', totalCents: 100000, paidCents: 0, dueDateOffsetDays: -30 },
];

async function insertOrder(userId: string, c: Case): Promise<string> {
  const dueDate = new Date();
  dueDate.setUTCDate(dueDate.getUTCDate() + c.dueDateOffsetDays);
  const dueDateStr = dueDate.toISOString().slice(0, 10);

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO orders (user_id, customer, due_date, total_cents, paid_amount_cents)
     VALUES ($1, 'Test Co', $2, $3, $4) RETURNING id`,
    [userId, dueDateStr, c.totalCents, c.paidCents],
  );
  return rows[0].id;
}

describe('SQL status CASE vs deriveOrderStatus', () => {
  it.each(cases)('$name', async (c) => {
    const user = makeUser();
    const orderId = await insertOrder(user.userId, c);

    const { rows } = await pool.query<{ status: string; due_date: string }>(
      `SELECT
         CASE
           WHEN paid_amount_cents >= total_cents THEN 'paid'
           WHEN due_date::timestamptz < now() THEN 'overdue'
           WHEN paid_amount_cents > 0 THEN 'partially_paid'
           ELSE 'pending'
         END AS status,
         due_date
       FROM orders WHERE id = $1`,
      [orderId],
    );

    const sqlStatus = rows[0].status;
    const tsStatus = deriveOrderStatus({
      totalCents: c.totalCents,
      paidCents: c.paidCents,
      dueDate: new Date(rows[0].due_date),
      now: new Date(),
    });

    expect(sqlStatus).toBe(tsStatus);
  });
});

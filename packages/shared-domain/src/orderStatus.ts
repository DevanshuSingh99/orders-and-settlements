/**
 * Order status derivation.
 *
 * This is intentionally the ONLY place this logic exists as TypeScript.
 * Every service, controller, and the frontend must call `deriveOrderStatus`
 * rather than re-implementing the rule. The orders-service also exposes an
 * equivalent SQL CASE expression (see orders-service/src/db/statusSql.ts)
 * for filtering `WHERE status = ...` efficiently in a list query; a test
 * in this package asserts both agree on every case below.
 */

export type OrderStatus = 'pending' | 'partially_paid' | 'paid' | 'overdue';

export interface DeriveOrderStatusInput {
  /** Order total in integer cents. */
  totalCents: number;
  /** Sum of all payments recorded against the order, in integer cents. */
  paidCents: number;
  /** The order's due date. */
  dueDate: Date;
  /** The current time, injected so this function is pure and easy to unit test. */
  now: Date;
}

/**
 * Derivation rules (in priority order - order matters):
 *
 *   1. paidCents >= totalCents               -> paid
 *   2. now > dueDate (and not fully paid)     -> overdue
 *   3. paidCents > 0 (and not overdue)        -> partially_paid
 *   4. otherwise                              -> pending
 *
 * Rule 1 is checked FIRST so that an order which was overdue but has since
 * been fully paid reports "paid", not "overdue" (see docs edge case: an
 * order due yesterday but paid in full today is "paid").
 */
export function deriveOrderStatus(input: DeriveOrderStatusInput): OrderStatus {
  const { totalCents, paidCents, dueDate, now } = input;

  if (paidCents >= totalCents) {
    return 'paid';
  }

  if (now.getTime() > dueDate.getTime()) {
    return 'overdue';
  }

  if (paidCents > 0) {
    return 'partially_paid';
  }

  return 'pending';
}

/** All valid status values, used for validating `?status=` query params. */
export const ORDER_STATUSES: readonly OrderStatus[] = ['pending', 'partially_paid', 'paid', 'overdue'];

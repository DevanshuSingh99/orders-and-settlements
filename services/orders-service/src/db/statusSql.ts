/**
 * SQL equivalent of `deriveOrderStatus` from @oas/shared-domain, used for
 * `WHERE status = ...` filtering and for the dashboard summary aggregates
 * directly in Postgres (recomputing status for every row in JS after
 * fetching all of them would not scale, and it must never be persisted -
 * see docs/implementation-plan.md section 6 and 9).
 *
 * IMPORTANT: this expression must stay logically identical to
 * `deriveOrderStatus`. `tests/statusConsistency.test.ts` asserts the two
 * agree across every case in the assignment's status matrix.
 *
 * We compare `due_date` (a DATE) against `now()` by casting to timestamptz,
 * which places the due date at UTC midnight - i.e. an order becomes
 * "overdue" starting at the first moment of the day after it was created
 * to be due at midnight UTC on `due_date`. This is documented as an
 * assumption in the README.
 */
export const ORDER_STATUS_CASE_SQL = `
  CASE
    WHEN paid_amount_cents >= total_cents THEN 'paid'
    WHEN due_date::timestamptz < now() THEN 'overdue'
    WHEN paid_amount_cents > 0 THEN 'partially_paid'
    ELSE 'pending'
  END
`;

/**
 * Postgres connection pool for payments-service.
 *
 * search_path includes BOTH `payments` (this service's own schema, for
 * unqualified table names like `payments`) and `orders` (so the guarded
 * atomic UPDATE against `orders.orders` - documented in
 * modules/payments/service.ts - can run in the same transaction as the
 * payment insert). This is the one deliberate cross-schema coupling in the
 * system; see docs/implementation-plan.md section 7 for why it was chosen
 * over a distributed saga for this assignment's scope.
 */
import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  options: '-c search_path=payments,orders,public',
});

export function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

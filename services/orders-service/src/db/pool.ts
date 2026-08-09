/**
 * Postgres connection pool scoped to the `orders` schema. Payments-service
 * writes directly to `orders.orders.paid_amount_cents` as part of its
 * atomic payment transaction (the shared-database pattern documented in
 * docs/implementation-plan.md section 7) - orders-service itself only ever
 * reads/writes within its own schema.
 */
import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Sets search_path as a connection startup parameter rather than an
  // extra query after connecting - avoids a race with the first query
  // issued on a freshly checked-out client.
  options: '-c search_path=orders,public',
});

export function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

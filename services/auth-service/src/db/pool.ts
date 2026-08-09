/**
 * Postgres connection pool, scoped to this service's `auth` schema.
 *
 * All services share one Postgres instance but each owns its own schema
 * (see docs/implementation-plan.md section 6). Setting `search_path` on
 * every new connection means queries can say `SELECT * FROM users` instead
 * of `auth.users` everywhere, without risking cross-schema access.
 */
import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Sets search_path as a connection startup parameter rather than an
  // extra query after connecting - avoids a race with the first query
  // issued on a freshly checked-out client.
  options: '-c search_path=auth,public',
});

/** Runs a query against the pool. Thin wrapper kept for a single place to add logging/metrics later. */
export function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

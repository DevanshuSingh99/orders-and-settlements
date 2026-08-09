/**
 * Postgres pool with access to auth/orders/payments schemas for cleanup SQL.
 * Tables are always schema-qualified so search_path is unused.
 */
import { Pool } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
});

export function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
) {
  return pool.query<T>(text, params);
}

/**
 * Data access for the `users` table. Kept intentionally thin - plain SQL,
 * no ORM - so query behavior (indexes used, exact columns) is easy to
 * reason about for a table that guards every user's identity.
 */
import { pool } from '../../db/pool';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function createUser(email: string, passwordHash: string): Promise<UserRow> {
  const { rows } = await pool.query<UserRow>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
    [email, passwordHash],
  );
  return rows[0];
}

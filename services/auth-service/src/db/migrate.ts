/**
 * Minimal, dependency-free SQL migration runner.
 *
 * Migrations are plain numbered .sql files in ./migrations. We track which
 * ones have run in a `schema_migrations` table so this script is safe to
 * run repeatedly (e.g. every container start) - it only applies new files,
 * in filename order, each inside its own transaction.
 */
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { env } from '../config/env';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations');

async function run() {
  const pool = new Pool({ connectionString: env.DATABASE_URL });

  try {
    await pool.query('CREATE SCHEMA IF NOT EXISTS auth');
    await pool.query('SET search_path TO auth, public');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    const { rows: applied } = await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations');
    const appliedSet = new Set(applied.map((row) => row.filename));

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        await client.query('SET search_path TO auth, public');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        console.log(`[auth-service] applied migration: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
      } finally {
        client.release();
      }
    }

    console.log('[auth-service] migrations up to date');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

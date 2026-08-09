/**
 * Test setup: truncates the users and audit_logs tables before each test so
 * tests are independent of each other and of prior runs. Requires
 * migrations to have already been applied (see `npm run migrate`) against
 * whatever DATABASE_URL is active - normally the docker-compose Postgres.
 */
import { pool } from '../src/db/pool';
import { redis } from '../src/db/redis';

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE users, audit_logs RESTART IDENTITY CASCADE');
  await redis.flushdb();
});

afterAll(async () => {
  await pool.end();
  redis.disconnect();
});

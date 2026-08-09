import { pool } from '../src/db/pool';

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE payments, refunds, audit_logs RESTART IDENTITY CASCADE');
  await pool.query('TRUNCATE TABLE orders.orders RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

import { pool } from '../src/db/pool';

beforeEach(async () => {
  await pool.query('TRUNCATE TABLE orders, order_line_items, audit_logs RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});

import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
import { makeUser } from './testAuth';
import { createTestOrder, getOrderPaidAmountCents } from './testOrders';
import './setup';

const app = createApp();
const todayIso = () => new Date().toISOString().slice(0, 10);

describe('Assignment sample scenario', () => {
  it('runs the exact scenario from the assignment doc end to end', async () => {
    const user = makeUser();
    // 1. Create an order: 2 x $500 = $1,000 total, due in 7 days.
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000, dueDateOffsetDays: 7 });

    // 2. Record payment of $400 -> status should be partially_paid, amount due $600.
    const first = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', user.authHeader)
      .send({ amount: 400, paymentDate: todayIso() });

    expect(first.status).toBe(201);
    expect(first.body.data.order.status).toBe('partially_paid');
    expect(first.body.data.order.due).toBe(600);

    // 3. Record payment of $600 -> status should be paid, amount due $0.
    const second = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', user.authHeader)
      .send({ amount: 600, paymentDate: todayIso() });

    expect(second.status).toBe(201);
    expect(second.body.data.order.status).toBe('paid');
    expect(second.body.data.order.due).toBe(0);

    // 4. Attempt to record another $1 payment -> should be rejected with a clear error.
    const third = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', user.authHeader)
      .send({ amount: 1, paymentDate: todayIso() });

    expect(third.status).toBe(409);
    expect(third.body.error.code).toBe('PAYMENT_EXCEEDS_REMAINING_BALANCE');
    expect(third.body.error.details.remainingAmount).toBe(0);
    expect(third.body.error.message).toContain('$0.00');

    // The rejected attempt must not have changed anything.
    expect(await getOrderPaidAmountCents(orderId)).toBe(100000);
  });
});

describe('Multiple payments summing correctly', () => {
  it('accepts $100 + $200 + $300 + $400 totalling exactly $1000', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });

    for (const amount of [100, 200, 300, 400]) {
      const res = await request(app)
        .post(`/api/orders/${orderId}/payments`)
        .set('Authorization', user.authHeader)
        .send({ amount, paymentDate: todayIso() });
      expect(res.status).toBe(201);
    }

    expect(await getOrderPaidAmountCents(orderId)).toBe(100000);
    const listRes = await request(app).get(`/api/orders/${orderId}/payments`).set('Authorization', user.authHeader);
    expect(listRes.body.data).toHaveLength(4);
  });
});

describe('Validation', () => {
  it('rejects a payment below the $0.01 minimum', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });

    const res = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', user.authHeader)
      .send({ amount: 0, paymentDate: todayIso() });

    expect(res.status).toBe(400);
  });

  it('rejects a missing payment date', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });

    const res = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', user.authHeader)
      .send({ amount: 10 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('requires authentication', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    const res = await request(app).post(`/api/orders/${orderId}/payments`).send({ amount: 10, paymentDate: todayIso() });
    expect(res.status).toBe(401);
  });
});

describe('Authorization / user isolation', () => {
  it("returns ORDER_NOT_FOUND (not 403) when paying another user's order", async () => {
    const owner = makeUser();
    const attacker = makeUser();
    const orderId = await createTestOrder({ userId: owner.userId, totalCents: 100000 });

    const res = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', attacker.authHeader)
      .send({ amount: 10, paymentDate: todayIso() });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    // Confirm the attacker's request truly did nothing.
    expect(await getOrderPaidAmountCents(orderId)).toBe(0);
  });

  it("cannot list another user's payments for their order", async () => {
    const owner = makeUser();
    const attacker = makeUser();
    const orderId = await createTestOrder({ userId: owner.userId, totalCents: 100000 });
    await request(app).post(`/api/orders/${orderId}/payments`).set('Authorization', owner.authHeader).send({ amount: 10, paymentDate: todayIso() });

    const res = await request(app).get(`/api/orders/${orderId}/payments`).set('Authorization', attacker.authHeader);
    expect(res.status).toBe(404);
  });
});

describe('Audit logging', () => {
  it('writes a PAYMENT_RECORDED audit row on success', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    await request(app).post(`/api/orders/${orderId}/payments`).set('Authorization', user.authHeader).send({ amount: 400, paymentDate: todayIso() });

    const { rows } = await pool.query("SELECT * FROM audit_logs WHERE action = 'PAYMENT_RECORDED'");
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.orderId).toBe(orderId);
    expect(Number(rows[0].metadata.newPaidAmountCents)).toBe(40000);
  });

  it('writes a PAYMENT_REJECTED audit row on overpayment, without creating a payment', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    await request(app).post(`/api/orders/${orderId}/payments`).set('Authorization', user.authHeader).send({ amount: 2000, paymentDate: todayIso() });

    const { rows } = await pool.query("SELECT * FROM audit_logs WHERE action = 'PAYMENT_REJECTED'");
    expect(rows).toHaveLength(1);

    const { rows: payments } = await pool.query('SELECT * FROM payments');
    expect(payments).toHaveLength(0);
  });
});

describe('Idempotency', () => {
  it('returns the same payment for a repeated Idempotency-Key instead of double-charging', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });

    const first = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', user.authHeader)
      .set('Idempotency-Key', 'retry-key-1')
      .send({ amount: 400, paymentDate: todayIso() });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/orders/${orderId}/payments`)
      .set('Authorization', user.authHeader)
      .set('Idempotency-Key', 'retry-key-1')
      .send({ amount: 400, paymentDate: todayIso() });

    expect(second.status).toBe(200);
    expect(second.body.data.payment.id).toBe(first.body.data.payment.id);

    // Only ONE payment should have actually been applied to the order.
    expect(await getOrderPaidAmountCents(orderId)).toBe(40000);
    const { rows } = await pool.query('SELECT * FROM payments WHERE order_id = $1', [orderId]);
    expect(rows).toHaveLength(1);
  });

  it('rejects reusing the same idempotency key for a different order', async () => {
    const user = makeUser();
    const orderId1 = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    const orderId2 = await createTestOrder({ userId: user.userId, totalCents: 100000 });

    await request(app)
      .post(`/api/orders/${orderId1}/payments`)
      .set('Authorization', user.authHeader)
      .set('Idempotency-Key', 'shared-key')
      .send({ amount: 100, paymentDate: todayIso() });

    const res = await request(app)
      .post(`/api/orders/${orderId2}/payments`)
      .set('Authorization', user.authHeader)
      .set('Idempotency-Key', 'shared-key')
      .send({ amount: 100, paymentDate: todayIso() });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_IDEMPOTENCY_KEY');
  });
});

describe('Concurrency - the critical race condition from the assignment', () => {
  it('never lets combined concurrent payments exceed the order total', async () => {
    // Order total $1,000, already paid $600, remaining $400. Two requests
    // for $300 each fire at the same instant - only one may succeed.
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    await request(app).post(`/api/orders/${orderId}/payments`).set('Authorization', user.authHeader).send({ amount: 600, paymentDate: todayIso() });

    const [resA, resB] = await Promise.all([
      request(app).post(`/api/orders/${orderId}/payments`).set('Authorization', user.authHeader).send({ amount: 300, paymentDate: todayIso() }),
      request(app).post(`/api/orders/${orderId}/payments`).set('Authorization', user.authHeader).send({ amount: 300, paymentDate: todayIso() }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const finalPaid = await getOrderPaidAmountCents(orderId);
    expect(finalPaid).toBe(90000); // $600 + exactly one $300, never $1200
    expect(finalPaid).toBeLessThanOrEqual(100000);

    const { rows } = await pool.query('SELECT * FROM payments WHERE order_id = $1', [orderId]);
    expect(rows).toHaveLength(2); // the initial $600 plus exactly one of the two $300s
  });

  it('allows both concurrent payments when their combined amount fits exactly', async () => {
    // Remaining is $1,000; two $500 payments fired concurrently should both succeed.
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });

    const [resA, resB] = await Promise.all([
      request(app).post(`/api/orders/${orderId}/payments`).set('Authorization', user.authHeader).send({ amount: 500, paymentDate: todayIso() }),
      request(app).post(`/api/orders/${orderId}/payments`).set('Authorization', user.authHeader).send({ amount: 500, paymentDate: todayIso() }),
    ]);

    expect(resA.status).toBe(201);
    expect(resB.status).toBe(201);
    expect(await getOrderPaidAmountCents(orderId)).toBe(100000);
  });
});

import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
import { makeUser } from './testAuth';
import { createTestOrder, getOrderPaidAmountCents } from './testOrders';
import './setup';

const app = createApp();
const todayIso = () => new Date().toISOString().slice(0, 10);

async function pay(orderId: string, authHeader: string, amount: number) {
  const res = await request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set('Authorization', authHeader)
    .send({ amount, paymentDate: todayIso() });
  expect(res.status).toBe(201);
  return res;
}

describe('Refund validation', () => {
  it('rejects a refund below the $0.01 minimum', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    await pay(orderId, user.authHeader, 400);

    const res = await request(app)
      .post(`/api/orders/${orderId}/refunds`)
      .set('Authorization', user.authHeader)
      .send({ amount: 0, refundDate: todayIso() });

    expect(res.status).toBe(400);
  });

  it('rejects a refund that exceeds the amount paid', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    await pay(orderId, user.authHeader, 400);

    const res = await request(app)
      .post(`/api/orders/${orderId}/refunds`)
      .set('Authorization', user.authHeader)
      .send({ amount: 401, refundDate: todayIso() });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REFUND_EXCEEDS_AMOUNT_PAID');
    expect(res.body.error.details.paidAmount).toBe(400);
    expect(res.body.error.details.maxAllowedAmount).toBe(400);
    expect(await getOrderPaidAmountCents(orderId)).toBe(40000);
  });

  it('rejects a refund when nothing has been paid', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });

    const res = await request(app)
      .post(`/api/orders/${orderId}/refunds`)
      .set('Authorization', user.authHeader)
      .send({ amount: 1, refundDate: todayIso() });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REFUND_EXCEEDS_AMOUNT_PAID');
    expect(res.body.error.details.maxAllowedAmount).toBe(0);
  });
});

describe('Refund happy path', () => {
  it('decrements paid, increases due, and re-derives status', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000, dueDateOffsetDays: 7 });
    await pay(orderId, user.authHeader, 1000);

    const refund = await request(app)
      .post(`/api/orders/${orderId}/refunds`)
      .set('Authorization', user.authHeader)
      .send({ amount: 400, refundDate: todayIso(), note: 'Partial refund' });

    expect(refund.status).toBe(201);
    expect(refund.body.data.refund.amount).toBe(400);
    expect(refund.body.data.order.paid).toBe(600);
    expect(refund.body.data.order.due).toBe(400);
    expect(refund.body.data.order.status).toBe('partially_paid');
    expect(await getOrderPaidAmountCents(orderId)).toBe(60000);

    const listRes = await request(app).get(`/api/orders/${orderId}/refunds`).set('Authorization', user.authHeader);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].note).toBe('Partial refund');
  });

  it('full refund clears paid and restores pending status', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000, dueDateOffsetDays: 7 });
    await pay(orderId, user.authHeader, 1000);

    const refund = await request(app)
      .post(`/api/orders/${orderId}/refunds`)
      .set('Authorization', user.authHeader)
      .send({ amount: 1000, refundDate: todayIso() });

    expect(refund.status).toBe(201);
    expect(refund.body.data.order.paid).toBe(0);
    expect(refund.body.data.order.due).toBe(1000);
    expect(refund.body.data.order.status).toBe('pending');
    expect(await getOrderPaidAmountCents(orderId)).toBe(0);
  });

  it('writes a PAYMENT_REFUNDED audit row on success', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    await pay(orderId, user.authHeader, 400);

    await request(app)
      .post(`/api/orders/${orderId}/refunds`)
      .set('Authorization', user.authHeader)
      .send({ amount: 100, refundDate: todayIso() });

    const { rows } = await pool.query("SELECT * FROM audit_logs WHERE action = 'PAYMENT_REFUNDED'");
    expect(rows).toHaveLength(1);
    expect(rows[0].entity_type).toBe('refund');
    expect(rows[0].metadata.orderId).toBe(orderId);
    expect(Number(rows[0].metadata.amountCents)).toBe(10000);
    expect(Number(rows[0].metadata.newPaidAmountCents)).toBe(30000);
  });
});

describe('Refund idempotency', () => {
  it('returns the same refund for a repeated Idempotency-Key instead of double-refunding', async () => {
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    await pay(orderId, user.authHeader, 400);

    const first = await request(app)
      .post(`/api/orders/${orderId}/refunds`)
      .set('Authorization', user.authHeader)
      .set('Idempotency-Key', 'refund-retry-1')
      .send({ amount: 100, refundDate: todayIso() });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post(`/api/orders/${orderId}/refunds`)
      .set('Authorization', user.authHeader)
      .set('Idempotency-Key', 'refund-retry-1')
      .send({ amount: 100, refundDate: todayIso() });

    expect(second.status).toBe(200);
    expect(second.body.data.refund.id).toBe(first.body.data.refund.id);
    expect(await getOrderPaidAmountCents(orderId)).toBe(30000);

    const { rows } = await pool.query('SELECT * FROM refunds WHERE order_id = $1', [orderId]);
    expect(rows).toHaveLength(1);
  });

  it('rejects reusing the same idempotency key for a different order', async () => {
    const user = makeUser();
    const orderId1 = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    const orderId2 = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    await pay(orderId1, user.authHeader, 200);
    await pay(orderId2, user.authHeader, 200);

    await request(app)
      .post(`/api/orders/${orderId1}/refunds`)
      .set('Authorization', user.authHeader)
      .set('Idempotency-Key', 'refund-shared-key')
      .send({ amount: 50, refundDate: todayIso() });

    const res = await request(app)
      .post(`/api/orders/${orderId2}/refunds`)
      .set('Authorization', user.authHeader)
      .set('Idempotency-Key', 'refund-shared-key')
      .send({ amount: 50, refundDate: todayIso() });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_IDEMPOTENCY_KEY');
  });
});

describe('Refund concurrency', () => {
  it('never lets combined concurrent refunds drive paid below zero', async () => {
    // Paid $400. Two $300 refunds fire at once — only one may succeed.
    const user = makeUser();
    const orderId = await createTestOrder({ userId: user.userId, totalCents: 100000 });
    await pay(orderId, user.authHeader, 400);

    const [resA, resB] = await Promise.all([
      request(app)
        .post(`/api/orders/${orderId}/refunds`)
        .set('Authorization', user.authHeader)
        .send({ amount: 300, refundDate: todayIso() }),
      request(app)
        .post(`/api/orders/${orderId}/refunds`)
        .set('Authorization', user.authHeader)
        .send({ amount: 300, refundDate: todayIso() }),
    ]);

    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);

    const finalPaid = await getOrderPaidAmountCents(orderId);
    expect(finalPaid).toBe(10000); // $400 - exactly one $300
    expect(finalPaid).toBeGreaterThanOrEqual(0);

    const { rows } = await pool.query('SELECT * FROM refunds WHERE order_id = $1', [orderId]);
    expect(rows).toHaveLength(1);
  });
});

import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
import { makeUser } from './testAuth';
import './setup';

const app = createApp();

function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}

function pastDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

describe('POST /api/orders', () => {
  it('creates an order and computes the total server-side (2 x $500 = $1000)', async () => {
    const user = makeUser();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', user.authHeader)
      .send({
        customer: 'Acme Corp',
        dueDate: futureDate(7),
        lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 500 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(1000);
    expect(res.body.data.paid).toBe(0);
    expect(res.body.data.due).toBe(1000);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.isEditable).toBe(true);
  });

  it('ignores any client-supplied total and always computes it server-side', async () => {
    const user = makeUser();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', user.authHeader)
      .send({
        customer: 'Acme Corp',
        dueDate: futureDate(7),
        total: 999999, // must be ignored - schema doesn't even accept it
        lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 10 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.total).toBe(10);
  });

  it('rejects an order with no line items', async () => {
    const user = makeUser();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', user.authHeader)
      .send({ customer: 'Acme', dueDate: futureDate(7), lineItems: [] });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects a line item with quantity below 1', async () => {
    const user = makeUser();
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', user.authHeader)
      .send({
        customer: 'Acme',
        dueDate: futureDate(7),
        lineItems: [{ description: 'Widget', quantity: 0, unitPrice: 10 }],
      });

    expect(res.status).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ customer: 'Acme', dueDate: futureDate(7), lineItems: [{ description: 'x', quantity: 1, unitPrice: 1 }] });
    expect(res.status).toBe(401);
  });

  it('writes an ORDER_CREATED audit row', async () => {
    const user = makeUser();
    await request(app)
      .post('/api/orders')
      .set('Authorization', user.authHeader)
      .send({ customer: 'Acme', dueDate: futureDate(7), lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 10 }] });

    const { rows } = await pool.query("SELECT * FROM audit_logs WHERE action = 'ORDER_CREATED'");
    expect(rows).toHaveLength(1);
    expect(rows[0].actor_id).toBe(user.userId);
  });
});

describe('GET /api/orders/:orderId', () => {
  it('returns line items alongside order totals', async () => {
    const user = makeUser();
    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', user.authHeader)
      .send({
        customer: 'Acme',
        dueDate: futureDate(7),
        lineItems: [
          { description: 'Widget', quantity: 2, unitPrice: 500 },
          { description: 'Gadget', quantity: 1, unitPrice: 25.5 },
        ],
      });

    const orderId = createRes.body.data.id;
    const res = await request(app).get(`/api/orders/${orderId}`).set('Authorization', user.authHeader);

    expect(res.status).toBe(200);
    expect(res.body.data.lineItems).toHaveLength(2);
    expect(res.body.data.total).toBe(1025.5);
  });

  it("returns ORDER_NOT_FOUND (not 403) for another user's order", async () => {
    const userA = makeUser();
    const userB = makeUser();

    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', userA.authHeader)
      .send({ customer: 'Acme', dueDate: futureDate(7), lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 10 }] });

    const orderId = createRes.body.data.id;
    const res = await request(app).get(`/api/orders/${orderId}`).set('Authorization', userB.authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
  });

  it('returns ORDER_NOT_FOUND for a random non-existent id', async () => {
    const user = makeUser();
    const res = await request(app)
      .get('/api/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', user.authHeader);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/orders (list + filters)', () => {
  it('only returns the current user\'s orders', async () => {
    const userA = makeUser();
    const userB = makeUser();

    await request(app).post('/api/orders').set('Authorization', userA.authHeader).send({
      customer: 'A Corp',
      dueDate: futureDate(7),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 1 }],
    });
    await request(app).post('/api/orders').set('Authorization', userB.authHeader).send({
      customer: 'B Corp',
      dueDate: futureDate(7),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 1 }],
    });

    const res = await request(app).get('/api/orders').set('Authorization', userA.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].customer).toBe('A Corp');
  });

  it('filters by status=overdue', async () => {
    const user = makeUser();
    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Overdue Co',
      dueDate: pastDate(5),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 100 }],
    });
    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Future Co',
      dueDate: futureDate(5),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 100 }],
    });

    const res = await request(app).get('/api/orders?status=overdue').set('Authorization', user.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].customer).toBe('Overdue Co');
  });

  it('paginates results with default limit 10', async () => {
    const user = makeUser();
    for (let i = 0; i < 12; i += 1) {
      await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
        customer: `Customer ${i}`,
        dueDate: futureDate(7),
        lineItems: [{ description: 'x', quantity: 1, unitPrice: 1 }],
      });
    }

    const res = await request(app).get('/api/orders?page=1&limit=10').set('Authorization', user.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.pagination).toEqual({ page: 1, limit: 10, total: 12 });
  });

  it('rejects limit below 10 or above 50', async () => {
    const user = makeUser();

    const tooSmall = await request(app).get('/api/orders?limit=5').set('Authorization', user.authHeader);
    expect(tooSmall.status).toBe(400);

    const tooLarge = await request(app).get('/api/orders?limit=100').set('Authorization', user.authHeader);
    expect(tooLarge.status).toBe(400);
  });

  it('filters by search on customer name', async () => {
    const user = makeUser();
    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Alpha Industries',
      dueDate: futureDate(7),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 10 }],
    });
    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Beta LLC',
      dueDate: futureDate(7),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 10 }],
    });

    const res = await request(app).get('/api/orders?search=Alpha').set('Authorization', user.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].customer).toBe('Alpha Industries');
  });

  it('sorts by customer, total, and status', async () => {
    const user = makeUser();
    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Charlie',
      dueDate: futureDate(7),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 300 }],
    });
    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Alice',
      dueDate: pastDate(3),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 100 }],
    });
    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Bob',
      dueDate: futureDate(7),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 200 }],
    });

    const byCustomer = await request(app)
      .get('/api/orders?sort=customer_asc')
      .set('Authorization', user.authHeader);
    expect(byCustomer.status).toBe(200);
    expect(byCustomer.body.data.map((o: { customer: string }) => o.customer)).toEqual([
      'Alice',
      'Bob',
      'Charlie',
    ]);

    const byTotal = await request(app)
      .get('/api/orders?sort=total_desc')
      .set('Authorization', user.authHeader);
    expect(byTotal.status).toBe(200);
    expect(byTotal.body.data.map((o: { total: number }) => o.total)).toEqual([300, 200, 100]);

    const byStatus = await request(app)
      .get('/api/orders?sort=status_asc')
      .set('Authorization', user.authHeader);
    expect(byStatus.status).toBe(200);
    // overdue < pending alphabetically
    expect(byStatus.body.data.map((o: { status: string }) => o.status)).toEqual([
      'overdue',
      'pending',
      'pending',
    ]);
  });
});

describe('PATCH /api/orders/:orderId (editability rules)', () => {
  it('allows editing line items before any payment exists', async () => {
    const user = makeUser();
    const createRes = await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Acme',
      dueDate: futureDate(7),
      lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 10 }],
    });
    const orderId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set('Authorization', user.authHeader)
      .send({ lineItems: [{ description: 'Widget', quantity: 5, unitPrice: 10 }] });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(50);
  });

  it('always allows editing customer and dueDate metadata', async () => {
    const user = makeUser();
    const createRes = await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Acme',
      dueDate: futureDate(7),
      lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 10 }],
    });
    const orderId = createRes.body.data.id;

    const res = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set('Authorization', user.authHeader)
      .send({ customer: 'Renamed Corp' });

    expect(res.status).toBe(200);
    expect(res.body.data.customer).toBe('Renamed Corp');
  });

  it('rejects line item changes once a payment has been recorded, with ORDER_NOT_EDITABLE', async () => {
    const user = makeUser();
    const createRes = await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Acme',
      dueDate: futureDate(7),
      lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 1000 }],
    });
    const orderId = createRes.body.data.id;

    // Simulate a payment having been recorded (payments-service's job in
    // production - see docs/implementation-plan.md section 7) by directly
    // updating the stored aggregate, exactly like the guarded UPDATE does.
    await pool.query('UPDATE orders SET paid_amount_cents = 100 WHERE id = $1', [orderId]);

    const res = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set('Authorization', user.authHeader)
      .send({ lineItems: [{ description: 'Widget', quantity: 2, unitPrice: 1000 }] });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_NOT_EDITABLE');
  });

  it('still allows metadata edits after a payment exists', async () => {
    const user = makeUser();
    const createRes = await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Acme',
      dueDate: futureDate(7),
      lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 1000 }],
    });
    const orderId = createRes.body.data.id;
    await pool.query('UPDATE orders SET paid_amount_cents = 100 WHERE id = $1', [orderId]);

    const res = await request(app)
      .patch(`/api/orders/${orderId}`)
      .set('Authorization', user.authHeader)
      .send({ customer: 'Still Renamable' });

    expect(res.status).toBe(200);
    expect(res.body.data.customer).toBe('Still Renamable');
  });
});

describe('DELETE /api/orders/:orderId', () => {
  it('deletes an order with no payments', async () => {
    const user = makeUser();
    const createRes = await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Acme',
      dueDate: futureDate(7),
      lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 10 }],
    });
    const orderId = createRes.body.data.id;

    const res = await request(app).delete(`/api/orders/${orderId}`).set('Authorization', user.authHeader);
    expect(res.status).toBe(200);

    const getRes = await request(app).get(`/api/orders/${orderId}`).set('Authorization', user.authHeader);
    expect(getRes.status).toBe(404);
  });

  it('refuses to delete an order that has payments', async () => {
    const user = makeUser();
    const createRes = await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Acme',
      dueDate: futureDate(7),
      lineItems: [{ description: 'Widget', quantity: 1, unitPrice: 1000 }],
    });
    const orderId = createRes.body.data.id;
    await pool.query('UPDATE orders SET paid_amount_cents = 100 WHERE id = $1', [orderId]);

    const res = await request(app).delete(`/api/orders/${orderId}`).set('Authorization', user.authHeader);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_NOT_EDITABLE');
  });
});

describe('GET /api/orders/summary', () => {
  it('aggregates outstanding, collected, overdue, and pending counts', async () => {
    const user = makeUser();

    const paidLater = await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Partially paid Co',
      dueDate: futureDate(30),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 1000 }],
    });
    await pool.query('UPDATE orders SET paid_amount_cents = 40000 WHERE id = $1', [paidLater.body.data.id]);

    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Overdue Co',
      dueDate: pastDate(1),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 500 }],
    });

    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Pending Co',
      dueDate: futureDate(30),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 200 }],
    });

    const res = await request(app).get('/api/orders/summary').set('Authorization', user.authHeader);
    expect(res.status).toBe(200);
    expect(res.body.data.totalCollected).toBe(400);
    expect(res.body.data.overdueCount).toBe(1);
    expect(res.body.data.pendingCount).toBe(1);
  });
});

describe('GET /api/orders/export', () => {
  it('requires authentication', async () => {
    const res = await request(app).get(
      `/api/orders/export?dueDateFrom=${pastDate(30)}&dueDateTo=${futureDate(30)}`,
    );
    expect(res.status).toBe(401);
  });

  it('requires both due dates and rejects from > to', async () => {
    const user = makeUser();

    const missing = await request(app).get('/api/orders/export').set('Authorization', user.authHeader);
    expect(missing.status).toBe(400);

    const inverted = await request(app)
      .get(`/api/orders/export?dueDateFrom=${futureDate(10)}&dueDateTo=${pastDate(1)}`)
      .set('Authorization', user.authHeader);
    expect(inverted.status).toBe(400);
  });

  it('returns header-only CSV for an empty match', async () => {
    const user = makeUser();
    const res = await request(app)
      .get(`/api/orders/export?dueDateFrom=${pastDate(30)}&dueDateTo=${pastDate(20)}`)
      .set('Authorization', user.authHeader);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['x-export-total']).toBe('0');
    expect(res.headers['x-export-count']).toBe('0');
    expect(res.headers['x-export-has-more']).toBe('false');
    expect(res.text.trim()).toBe('id,customer,status,total,paid,due,dueDate,createdAt');
  });

  it('exports matching rows with escaping, filters, and chunk headers', async () => {
    const user = makeUser();
    const other = makeUser();

    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Acme, "Corp"',
      dueDate: futureDate(5),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 100 }],
    });
    await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
      customer: 'Beta LLC',
      dueDate: futureDate(10),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 50 }],
    });
    await request(app).post('/api/orders').set('Authorization', other.authHeader).send({
      customer: 'Other User Co',
      dueDate: futureDate(5),
      lineItems: [{ description: 'x', quantity: 1, unitPrice: 999 }],
    });

    const from = pastDate(1);
    const to = futureDate(30);
    const res = await request(app)
      .get(`/api/orders/export?dueDateFrom=${from}&dueDateTo=${to}&search=Acme&limit=1&offset=0`)
      .set('Authorization', user.authHeader);

    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain(`orders-${from}-to-${to}.csv`);
    expect(res.headers['x-export-total']).toBe('1');
    expect(res.headers['x-export-offset']).toBe('0');
    expect(res.headers['x-export-count']).toBe('1');
    expect(res.headers['x-export-has-more']).toBe('false');
    expect(res.text).toContain('id,customer,status,total,paid,due,dueDate,createdAt');
    expect(res.text).toContain('"Acme, ""Corp"""');
    expect(res.text).toContain('100.00');
    expect(res.text).not.toContain('Other User Co');
    expect(res.text).not.toContain('Beta LLC');
  });

  it('supports offset continuation via X-Export-Has-More', async () => {
    const user = makeUser();
    for (let i = 0; i < 3; i += 1) {
      await request(app).post('/api/orders').set('Authorization', user.authHeader).send({
        customer: `Export ${i}`,
        dueDate: futureDate(7),
        lineItems: [{ description: 'x', quantity: 1, unitPrice: 10 }],
      });
    }

    const from = pastDate(1);
    const to = futureDate(30);
    const first = await request(app)
      .get(`/api/orders/export?dueDateFrom=${from}&dueDateTo=${to}&limit=2&offset=0&sort=customer_asc`)
      .set('Authorization', user.authHeader);

    expect(first.status).toBe(200);
    expect(first.headers['x-export-total']).toBe('3');
    expect(first.headers['x-export-count']).toBe('2');
    expect(first.headers['x-export-has-more']).toBe('true');

    const second = await request(app)
      .get(`/api/orders/export?dueDateFrom=${from}&dueDateTo=${to}&limit=2&offset=2&sort=customer_asc`)
      .set('Authorization', user.authHeader);

    expect(second.status).toBe(200);
    expect(second.headers['x-export-offset']).toBe('2');
    expect(second.headers['x-export-count']).toBe('1');
    expect(second.headers['x-export-has-more']).toBe('false');
    // Data rows are id,customer,... — match the customer column value.
    expect(second.text.split('\n').filter((line) => line.includes(',Export ')).length).toBe(1);
  });
});

/**
 * Gateway tests use lightweight mock downstream services (plain Express
 * apps on ephemeral ports) instead of the real auth/orders/payments
 * services, so we can test routing, authentication, and rate limiting in
 * isolation. Environment variables must be set BEFORE the gateway's env
 * loader runs, so we use jest.isolateModules to import a fresh `createApp`
 * after pointing it at our mocks.
 */
import http from 'http';
import type { Express } from 'express';
import express from 'express';
import request from 'supertest';
import { signAccessToken } from '@oas/shared-domain';

async function startMock(handler: (app: Express) => void): Promise<{ server: http.Server; url: string }> {
  const app = express();
  app.use(express.json());
  handler(app);
  const server = await new Promise<http.Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  return { server, url: `http://127.0.0.1:${port}` };
}

describe('gateway', () => {
  let authMock: Awaited<ReturnType<typeof startMock>>;
  let ordersMock: Awaited<ReturnType<typeof startMock>>;
  let paymentsMock: Awaited<ReturnType<typeof startMock>>;
  let app: Express;
  let redisClient: { disconnect: () => void };
  const JWT_SECRET = 'test-secret-at-least-16-chars';

  beforeAll(async () => {
    authMock = await startMock((mockApp) => {
      mockApp.post('/api/auth/login', (_req, res) => res.status(200).json({ data: { ok: true } }));
    });
    ordersMock = await startMock((mockApp) => {
      mockApp.get('/api/orders', (req, res) =>
        res.status(200).json({ data: [], forwardedUserId: req.header('x-user-id') ?? null }),
      );
    });
    paymentsMock = await startMock((mockApp) => {
      mockApp.post('/api/orders/:orderId/payments', (req, res) =>
        res.status(201).json({ data: { orderId: req.params.orderId, forwardedUserId: req.header('x-user-id') ?? null } }),
      );
      mockApp.post('/api/orders/:orderId/refunds', (req, res) =>
        res.status(201).json({ data: { orderId: req.params.orderId, forwardedUserId: req.header('x-user-id') ?? null } }),
      );
    });

    process.env.JWT_SECRET = JWT_SECRET;
    process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
    process.env.AUTH_SERVICE_URL = authMock.url;
    process.env.ORDERS_SERVICE_URL = ordersMock.url;
    process.env.PAYMENTS_SERVICE_URL = paymentsMock.url;
    process.env.CORS_ORIGINS = 'http://localhost:3000';
    process.env.RATE_LIMIT_MAX = '1000';

    let createApp!: () => Express;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      createApp = require('../src/app').createApp;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      redisClient = require('../src/db/redis').redis;
    });
    app = createApp();
  });

  afterAll(async () => {
    await Promise.all([authMock.server.close(), ordersMock.server.close(), paymentsMock.server.close()]);
    redisClient.disconnect();
  });

  function authHeaderFor(userId: string): string {
    const token = signAccessToken({ userId, email: `${userId}@example.com`, secret: JWT_SECRET, expiresIn: '1h' });
    return `Bearer ${token}`;
  }

  it('answers its own health check without touching downstream services', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('proxies /api/auth/* without requiring authentication', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: 'x' });
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
  });

  it('rejects /api/orders without a token', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('proxies /api/orders with a valid token and forwards x-user-id', async () => {
    const res = await request(app).get('/api/orders').set('Authorization', authHeaderFor('user-123'));
    expect(res.status).toBe(200);
    expect(res.body.forwardedUserId).toBe('user-123');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const badToken = signAccessToken({ userId: 'user-1', email: 'a@example.com', secret: 'wrong-secret-wrong-secret', expiresIn: '1h' });
    const res = await request(app).get('/api/orders').set('Authorization', `Bearer ${badToken}`);
    expect(res.status).toBe(401);
  });

  it('routes payment requests to payments-service, not orders-service', async () => {
    const res = await request(app)
      .post('/api/orders/order-abc/payments')
      .set('Authorization', authHeaderFor('user-123'))
      .send({ amount: 10, paymentDate: '2024-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.data.orderId).toBe('order-abc');
    expect(res.body.data.forwardedUserId).toBe('user-123');
  });

  it('routes refund requests to payments-service, not orders-service', async () => {
    const res = await request(app)
      .post('/api/orders/order-abc/refunds')
      .set('Authorization', authHeaderFor('user-123'))
      .send({ amount: 10, refundDate: '2024-01-01' });

    expect(res.status).toBe(201);
    expect(res.body.data.orderId).toBe('order-abc');
    expect(res.body.data.forwardedUserId).toBe('user-123');
  });

  it('returns a consistent NOT_FOUND envelope for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

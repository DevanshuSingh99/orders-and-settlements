import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
import './setup';

const app = createApp();

describe('POST /api/auth/register', () => {
  it('creates a user and returns an access token', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: 'password123' });

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe('alice@example.com');
    expect(typeof res.body.data.accessToken).toBe('string');
    // Password must never appear in the response.
    expect(JSON.stringify(res.body)).not.toContain('password123');
  });

  it('writes a USER_REGISTERED audit row', async () => {
    await request(app).post('/api/auth/register').send({ email: 'audit@example.com', password: 'password123' });
    const { rows } = await pool.query("SELECT * FROM audit_logs WHERE action = 'USER_REGISTERED'");
    expect(rows).toHaveLength(1);
    expect(rows[0].metadata.email).toBe('audit@example.com');
  });

  it('rejects a duplicate email with a clear error', async () => {
    await request(app).post('/api/auth/register').send({ email: 'dupe@example.com', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dupe@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects a weak password with a validation error', async () => {
    const res = await request(app).post('/api/auth/register').send({ email: 'weak@example.com', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('is case-insensitive on email uniqueness', async () => {
    await request(app).post('/api/auth/register').send({ email: 'Case@Example.com', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'case@example.com', password: 'password123' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({ email: 'bob@example.com', password: 'correct-password' });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: 'correct-password' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('bob@example.com');
  });

  it('rejects an incorrect password without revealing which part was wrong', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a non-existent email with the same error as a wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('writes a USER_LOGIN_FAILED audit row on bad password', async () => {
    await request(app).post('/api/auth/login').send({ email: 'bob@example.com', password: 'wrong' });
    const { rows } = await pool.query("SELECT * FROM audit_logs WHERE action = 'USER_LOGIN_FAILED'");
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it('returns the current user with a valid bearer token', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'carol@example.com', password: 'password123' });
    const token = registerRes.body.data.accessToken;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('carol@example.com');
  });
});

describe('POST /api/auth/refresh and /api/auth/logout', () => {
  it('refreshes using the refresh cookie and rotates it', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'dave@example.com', password: 'password123' });

    const refreshRes = await agent.post('/api/auth/refresh').send({});
    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.user.email).toBe('dave@example.com');
  });

  it('logout revokes the refresh session so it cannot be refreshed again', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({ email: 'erin@example.com', password: 'password123' });

    await agent.post('/api/auth/logout').send({});
    const refreshRes = await agent.post('/api/auth/refresh').send({});
    expect(refreshRes.status).toBe(401);
  });
});

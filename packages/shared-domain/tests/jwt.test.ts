import { signAccessToken, verifyAccessToken } from '../src/jwt';

describe('signAccessToken / verifyAccessToken', () => {
  const secret = 'test-secret-do-not-use-in-prod';

  it('round-trips a valid token', () => {
    const token = signAccessToken({ userId: 'user-1', email: 'a@example.com', secret, expiresIn: '15m' });
    const claims = verifyAccessToken(token, secret);
    // jsonwebtoken adds standard `iat`/`exp` claims automatically; we only assert our own fields.
    expect(claims).toEqual(expect.objectContaining({ sub: 'user-1', email: 'a@example.com', type: 'access' }));
  });

  it('returns null for a token signed with a different secret', () => {
    const token = signAccessToken({ userId: 'user-1', email: 'a@example.com', secret, expiresIn: '15m' });
    expect(verifyAccessToken(token, 'wrong-secret')).toBeNull();
  });

  it('returns null for a malformed token', () => {
    expect(verifyAccessToken('not-a-jwt', secret)).toBeNull();
  });

  it('returns null for an expired token', () => {
    const token = signAccessToken({ userId: 'user-1', email: 'a@example.com', secret, expiresIn: '-1s' });
    expect(verifyAccessToken(token, secret)).toBeNull();
  });
});

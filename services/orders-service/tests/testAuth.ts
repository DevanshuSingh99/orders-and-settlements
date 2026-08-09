/**
 * Test helper: mints access tokens directly with the shared JWT secret,
 * without going through auth-service (orders-service only verifies
 * tokens, it doesn't issue them). Using two different random user ids lets
 * tests prove user isolation (Invariant 4 - a user must never see another
 * user's order).
 */
import { randomUUID } from 'crypto';
import { signAccessToken } from '@oas/shared-domain';
import { env } from '../src/config/env';

export function makeUser() {
  const userId = randomUUID();
  const email = `${userId}@example.com`;
  const token = signAccessToken({ userId, email, secret: env.JWT_SECRET, expiresIn: '1h' });
  return { userId, email, token, authHeader: `Bearer ${token}` };
}

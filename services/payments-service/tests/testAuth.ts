/** Test helper: mints access tokens directly, same pattern as orders-service's tests. */
import { randomUUID } from 'crypto';
import { signAccessToken } from '@oas/shared-domain';
import { env } from '../src/config/env';

export function makeUser() {
  const userId = randomUUID();
  const email = `${userId}@example.com`;
  const token = signAccessToken({ userId, email, secret: env.JWT_SECRET, expiresIn: '1h' });
  return { userId, email, token, authHeader: `Bearer ${token}` };
}

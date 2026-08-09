/**
 * Redis client used for refresh-token session storage. Sessions live in
 * Redis (not Postgres) because they are short-lived, high-churn, and
 * benefit from a native TTL - no cleanup job needed for expired sessions.
 */
import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL);

const REFRESH_SESSION_PREFIX = 'auth:refresh:';

/** Stores a refresh token -> userId mapping with a TTL matching REFRESH_TTL_DAYS. */
export async function storeRefreshSession(refreshToken: string, userId: string, ttlSeconds: number): Promise<void> {
  await redis.set(REFRESH_SESSION_PREFIX + refreshToken, userId, 'EX', ttlSeconds);
}

/** Returns the userId for a refresh token, or null if it doesn't exist/expired/was revoked. */
export async function getUserIdForRefreshSession(refreshToken: string): Promise<string | null> {
  return redis.get(REFRESH_SESSION_PREFIX + refreshToken);
}

/** Revokes a single refresh token (used on logout and on refresh-token rotation). */
export async function revokeRefreshSession(refreshToken: string): Promise<void> {
  await redis.del(REFRESH_SESSION_PREFIX + refreshToken);
}

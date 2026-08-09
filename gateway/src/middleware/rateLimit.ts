/**
 * Simple fixed-window rate limiter backed by Redis, so limits are shared
 * across every gateway instance rather than per-process. Keyed by the
 * authenticated user id when available, otherwise by IP, so one noisy
 * anonymous client can't exhaust another user's budget.
 *
 * This is intentionally simple (a fixed window, not a sliding one) - good
 * enough to stop accidental retry storms and basic abuse for this
 * assignment's scope; a production system would likely use a sliding
 * window or token bucket instead.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { redis } from '../db/redis';
import { env } from '../config/env';

export async function rateLimit(req: Request, res: Response, next: NextFunction): Promise<void> {
  const identity = req.headers['x-user-id'] as string | undefined;
  const key = `ratelimit:${identity ?? req.ip}`;
  const windowSeconds = Math.ceil(env.RATE_LIMIT_WINDOW_MS / 1000);

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }

    const remaining = Math.max(env.RATE_LIMIT_MAX - count, 0);
    res.setHeader('x-ratelimit-limit', env.RATE_LIMIT_MAX);
    res.setHeader('x-ratelimit-remaining', remaining);

    if (count > env.RATE_LIMIT_MAX) {
      throw new AppError(
        ErrorCode.RATE_LIMITED,
        `Too many requests. Please try again in under ${windowSeconds} seconds.`,
      );
    }

    next();
  } catch (err) {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    // If Redis itself is unreachable, fail open rather than taking the
    // whole API down over a non-critical dependency.
    next();
  }
}

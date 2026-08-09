import Redis from 'ioredis';
import { env } from '../config/env';

export const redis = new Redis(env.REDIS_URL);

export const RUN_TTL_SECONDS = 60 * 60; // 1 hour
export const ACTIVE_RUN_LOCK_KEY = 'testrunner:active-run';
export const RUN_KEY_PREFIX = 'testrunner:run:';

export function runKey(runId: string): string {
  return RUN_KEY_PREFIX + runId;
}

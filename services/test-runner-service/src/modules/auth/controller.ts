import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { z } from 'zod';
import { env } from '../../config/env';
import { redis } from '../../db/redis';
import { asyncHandler } from '../../middleware/asyncHandler';
import { signRunnerToken } from './jwt';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const LOGIN_RATE_PREFIX = 'testrunner:login:';
const LOGIN_RATE_WINDOW_SEC = 60;
const LOGIN_RATE_MAX = 10;

async function assertLoginRateLimit(ip: string): Promise<void> {
  const key = LOGIN_RATE_PREFIX + ip;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, LOGIN_RATE_WINDOW_SEC);
  }
  if (count > LOGIN_RATE_MAX) {
    throw new AppError(ErrorCode.RATE_LIMITED, 'Too many login attempts. Try again shortly.');
  }
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  await assertLoginRateLimit(req.ip ?? 'unknown');

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Username and password are required.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const { username, password } = parsed.data;
  if (username !== env.TEST_RUNNER_USER || password !== env.TEST_RUNNER_PASSWORD) {
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Invalid username or password.');
  }

  const accessToken = signRunnerToken();
  res.status(200).json({ data: { accessToken, tokenType: 'Bearer' } });
});

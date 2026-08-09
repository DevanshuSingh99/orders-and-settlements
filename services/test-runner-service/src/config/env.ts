/**
 * Loads and validates environment configuration for test-runner-service.
 * Shares the root `env/` folder with other services (APP_ENV selects the file).
 * Refuses to start unless TEST_RUNNER_ENABLED=true.
 */
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

const envFileName = process.env.APP_ENV ? `.env.${process.env.APP_ENV}` : '.env';
dotenv.config({ path: path.resolve(__dirname, '../../../../env', envFileName) });

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  TEST_RUNNER_ENABLED: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .refine((v) => v === true, { message: 'TEST_RUNNER_ENABLED must be true' }),
  TEST_RUNNER_USER: z.string().min(1, 'TEST_RUNNER_USER is required'),
  TEST_RUNNER_PASSWORD: z.string().min(1, 'TEST_RUNNER_PASSWORD is required'),
  TEST_RUNNER_JWT_SECRET: z.string().min(16, 'TEST_RUNNER_JWT_SECRET must be at least 16 characters'),
  TEST_RUNNER_JWT_TTL: z.string().default('2h'),
  PUBLIC_API_BASE_URL: z.string().url('PUBLIC_API_BASE_URL must be a valid URL'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  TEST_RUNNER_PORT: z.coerce.number().int().positive().default(4004),
  CORS_ORIGINS: z.string().default('http://localhost:3001'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration for test-runner-service:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
};

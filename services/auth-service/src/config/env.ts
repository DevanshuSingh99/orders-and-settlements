/**
 * Loads and validates environment configuration for auth-service.
 *
 * All backend services read the SAME shared `env/` folder at the repo root
 * (see docs/implementation-plan.md section 4). Which file is loaded depends
 * on APP_ENV: `dev` -> env/.env.dev, `prod` -> env/.env.prod, unset -> env/.env.
 *
 * Validating with zod at boot means a missing/malformed variable crashes
 * the service immediately with a clear message, instead of failing later
 * on the first request that happens to need it.
 */
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

const envFileName = process.env.APP_ENV ? `.env.${process.env.APP_ENV}` : '.env';
// __dirname at runtime is services/auth-service/dist/config (built) or src/config (ts-node);
// the shared env folder is always three levels up from src|dist/config.
dotenv.config({ path: path.resolve(__dirname, '../../../../env', envFileName) });

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  AUTH_PORT: z.coerce.number().int().positive().default(4001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast and loudly rather than starting a half-configured service.
  console.error('Invalid environment configuration for auth-service:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
};

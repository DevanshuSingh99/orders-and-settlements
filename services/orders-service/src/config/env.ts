/**
 * Loads and validates environment configuration for orders-service.
 * See services/auth-service/src/config/env.ts for the full rationale -
 * every service repeats this small, dependency-free loader independently.
 */
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

const envFileName = process.env.APP_ENV ? `.env.${process.env.APP_ENV}` : '.env';
dotenv.config({ path: path.resolve(__dirname, '../../../../env', envFileName) });

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  ORDERS_PORT: z.coerce.number().int().positive().default(4002),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration for orders-service:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((origin) => origin.trim()),
};

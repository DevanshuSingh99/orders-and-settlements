/**
 * Structured JSON logger. Using pino (rather than console.log) gives us
 * consistent, machine-parseable log lines with levels and timestamps, which
 * matters once logs are aggregated in production. `pino-http` attaches a
 * child logger with the request id to every HTTP request (see requestId.ts).
 */
import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: { service: 'auth-service' },
});

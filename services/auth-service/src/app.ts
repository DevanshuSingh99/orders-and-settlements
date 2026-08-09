/**
 * Express app wiring for auth-service. Kept separate from server.ts so
 * integration tests can import the app directly with supertest, without
 * binding a real port.
 */
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { authRouter } from './modules/auth/routes';

export function createApp(): Express {
  const app = express();

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId: string }).requestId,
      // Keep production logs lean; full request/response bodies are never logged
      // since they can contain passwords or tokens.
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'auth-service' });
  });

  app.use('/api/auth', authRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

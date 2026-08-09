/**
 * Express app wiring for test-runner-service. Kept separate from server.ts
 * so tests can import the app with supertest without binding a port.
 */
import cors from 'cors';
import express, { type Express } from 'express';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { testRouter } from './modules/routes';

export function createApp(): Express {
  const app = express();

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { requestId: string }).requestId,
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'test-runner-service' });
  });

  app.use('/test', testRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

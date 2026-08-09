import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestId } from './middleware/requestId';
import { paymentsRouter } from './modules/payments/routes';
import { refundsRouter } from './modules/refunds/routes';

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
  app.use(express.json());
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'payments-service' });
  });

  // Mirrors the assignment's REST shape: /api/orders/:orderId/payments*
  app.use('/api/orders/:orderId/payments', paymentsRouter);
  app.use('/api/orders/:orderId/refunds', refundsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

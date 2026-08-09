/**
 * Gateway routing:
 *   /api/auth/*                       -> auth-service (public; auth-service enforces its own protected routes)
 *   /api/orders/:orderId/payments/*   -> payments-service (protected)
 *   /api/orders/:orderId/refunds/*    -> payments-service (protected)
 *   /api/orders/*                     -> orders-service (protected)
 *
 * The payments/refunds routes are registered BEFORE the general orders route
 * since Express matches middleware in registration order and those are the
 * more specific paths.
 *
 * Deliberately no express.json() here: the gateway only needs to read
 * headers/cookies to authenticate, never the body, so every request body
 * is streamed through to the downstream service untouched.
 */
import cors from 'cors';
import express, { type Express } from 'express';
import pinoHttp from 'pino-http';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authenticate } from './middleware/authenticate';
import { rateLimit } from './middleware/rateLimit';
import { requestId } from './middleware/requestId';
import { createServiceProxy } from './proxy/createServiceProxy';

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
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      // Let the dashboard read export pagination headers when stitching CSV chunks.
      exposedHeaders: [
        'Content-Disposition',
        'X-Export-Total',
        'X-Export-Offset',
        'X-Export-Count',
        'X-Export-Has-More',
      ],
    }),
  );

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'gateway' });
  });

  const authProxy = createServiceProxy(env.AUTH_SERVICE_URL);
  const ordersProxy = createServiceProxy(env.ORDERS_SERVICE_URL);
  const paymentsProxy = createServiceProxy(env.PAYMENTS_SERVICE_URL);

  app.use('/api/auth', authProxy);
  app.use(/^\/api\/orders\/[^/]+\/payments/, authenticate, rateLimit, paymentsProxy);
  app.use(/^\/api\/orders\/[^/]+\/refunds/, authenticate, rateLimit, paymentsProxy);
  app.use('/api/orders', authenticate, rateLimit, ordersProxy);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

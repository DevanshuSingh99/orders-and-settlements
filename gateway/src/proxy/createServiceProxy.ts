/**
 * Thin wrapper around http-proxy-middleware for forwarding requests to a
 * downstream service unchanged (same path, same body/headers plus the
 * x-request-id / x-user-id we've added). The gateway deliberately does NOT
 * parse JSON bodies itself (see app.ts) so the original request stream can
 * be piped straight through without any risk of a body-parsing/re-encoding
 * mismatch.
 *
 * Express's `app.use(path, ...)` strips `path` from `req.url` for the
 * duration of that middleware chain (e.g. a handler mounted at
 * `/api/orders` sees a path starting from `/`). `req.originalUrl` is
 * never touched by Express, so `pathRewrite` uses it directly to forward
 * the exact path the client requested, regardless of how this proxy is
 * mounted.
 */
import { createProxyMiddleware } from 'http-proxy-middleware';
import { logger } from '../config/logger';

export function createServiceProxy(target: string) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (_path, req) => (req as unknown as { originalUrl: string }).originalUrl,
    on: {
      error: (err, _req, res) => {
        logger.error({ err, target }, 'Proxy error reaching downstream service');
        if ('writeHead' in res && !res.headersSent) {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              error: { code: 'INTERNAL_ERROR', message: 'The service is temporarily unavailable. Please try again.' },
            }),
          );
        }
      },
    },
  });
}

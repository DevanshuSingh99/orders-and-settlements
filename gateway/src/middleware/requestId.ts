/**
 * Generates (or reuses) a request id and forwards it as `x-request-id` to
 * whichever downstream service handles the request, so a single request
 * can be traced across the gateway's logs and the service's logs/audit rows.
 */
import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
  }
}

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  req.requestId = incoming && incoming.length > 0 ? incoming : randomUUID();
  req.headers['x-request-id'] = req.requestId;
  res.setHeader('x-request-id', req.requestId);
  next();
}

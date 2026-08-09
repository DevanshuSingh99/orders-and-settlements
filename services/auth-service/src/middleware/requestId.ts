/**
 * Attaches a request id to every request: reuses an incoming `x-request-id`
 * header (set by the gateway) if present, otherwise generates one. This id
 * is echoed back in the response and stored on audit log rows, so a single
 * request can be traced across logs, audit entries, and error reports.
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
  res.setHeader('x-request-id', req.requestId);
  next();
}

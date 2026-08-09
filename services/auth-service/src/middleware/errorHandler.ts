/**
 * Central error handler. Converts a thrown `AppError` into the standard
 * `{ error: { code, message, details } }` envelope; anything else is an
 * unexpected bug, so it is logged with full detail server-side but the
 * client only ever sees a generic INTERNAL_ERROR - stack traces must never
 * leak to callers.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { logger } from '../config/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json(err.toEnvelope());
    return;
  }

  logger.error({ err, requestId: req.requestId, path: req.path }, 'Unhandled error');
  res.status(500).json({
    error: { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred. Please try again.' },
  });
}

/** 404 handler for routes that don't match anything, kept in the same standard envelope. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: ErrorCode.NOT_FOUND, message: `No route matches ${req.method} ${req.path}.` },
  });
}

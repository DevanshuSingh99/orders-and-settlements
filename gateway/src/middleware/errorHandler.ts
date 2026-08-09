import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { logger } from '../config/logger';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json(err.toEnvelope());
    return;
  }

  logger.error({ err, requestId: req.requestId, path: req.path }, 'Unhandled error at gateway');
  res.status(500).json({
    error: { code: ErrorCode.INTERNAL_ERROR, message: 'An unexpected error occurred. Please try again.' },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: { code: ErrorCode.NOT_FOUND, message: `No route matches ${req.method} ${req.path}.` },
  });
}

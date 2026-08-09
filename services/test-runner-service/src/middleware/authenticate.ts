import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { verifyRunnerToken } from '../modules/auth/jwt';

/** Bearer header, or `?token=` for EventSource (which cannot set Authorization). */
export function extractRunnerToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  const q = req.query.token;
  if (typeof q === 'string' && q.length > 0) {
    return q;
  }
  return null;
}

export function authenticateRunner(req: Request, _res: Response, next: NextFunction): void {
  const token = extractRunnerToken(req);
  if (!token) {
    throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }

  const claims = verifyRunnerToken(token);
  if (!claims) {
    throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED, 'Invalid or expired runner session.');
  }

  req.runnerAuthenticated = true;
  next();
}

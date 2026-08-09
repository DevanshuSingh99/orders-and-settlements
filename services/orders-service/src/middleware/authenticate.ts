/**
 * Verifies the access token independently of the gateway. Orders-service
 * never trusts that the gateway already authenticated the caller - see
 * docs/implementation-plan.md section 2.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode, verifyAccessToken } from '@oas/shared-domain';
import { env } from '../config/env';

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  const cookieToken = (req as unknown as { cookies?: Record<string, string> }).cookies?.['oas_access_token'];
  return typeof cookieToken === 'string' ? cookieToken : null;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED, 'Authentication required.');
  }

  const claims = verifyAccessToken(token, env.JWT_SECRET);
  if (!claims) {
    throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED, 'Invalid or expired session. Please log in again.');
  }

  req.userId = claims.sub;
  next();
}

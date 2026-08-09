/**
 * Authentication middleware. Accepts EITHER the httpOnly access cookie
 * (normal browser flow) OR an `Authorization: Bearer` header (curl, tests,
 * the browser-based test runner). Verifies the JWT locally rather than
 * trusting the gateway, per the "never rely on a single layer" rule in
 * docs/implementation-plan.md section 2.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode, verifyAccessToken } from '@oas/shared-domain';
import { env } from '../config/env';
import { ACCESS_COOKIE_NAME } from '../modules/auth/cookies';

declare module 'express-serve-static-core' {
  interface Request {
    userId?: string;
    userEmail?: string;
  }
}

function extractToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  const cookieToken = req.cookies?.[ACCESS_COOKIE_NAME];
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
  req.userEmail = claims.email;
  next();
}

/**
 * Best-effort authentication that never throws: used for endpoints like
 * logout, where a caller with an already-expired access token should still
 * be able to clear their session and revoke the refresh token.
 */
export function tryAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  const claims = token ? verifyAccessToken(token, env.JWT_SECRET) : null;
  if (claims) {
    req.userId = claims.sub;
    req.userEmail = claims.email;
  }
  next();
}

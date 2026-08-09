/**
 * Gateway-level authentication. This is a first line of defense and a
 * convenience (it lets us forward a trusted `x-user-id` header downstream
 * so services don't have to re-parse the token), but it is NOT the only
 * line of defense - every service independently re-verifies the JWT
 * itself (see docs/implementation-plan.md section 2). If this middleware
 * were ever bypassed or misconfigured, requests would still be rejected
 * downstream.
 */
import type { NextFunction, Request, Response } from 'express';
import { AppError, ErrorCode, verifyAccessToken } from '@oas/shared-domain';
import { env } from '../config/env';

function extractToken(req: Request): string | null {
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }
  const cookieHeader = req.header('cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)oas_access_token=([^;]+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
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

  // Forwarded as a convenience for services/logging - downstream services
  // do NOT trust this header alone, they re-verify the JWT themselves.
  req.headers['x-user-id'] = claims.sub;
  next();
}

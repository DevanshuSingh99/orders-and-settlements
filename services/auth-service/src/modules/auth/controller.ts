/**
 * HTTP layer for auth: parses/validates requests, calls the service layer,
 * and shapes responses. No business logic lives here.
 */
import type { Request, Response } from 'express';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { asyncHandler } from '../../middleware/asyncHandler';
import { clearAuthCookies, REFRESH_COOKIE_NAME, setAuthCookies } from './cookies';
import * as authService from './service';
import { loginSchema, registerSchema } from './schemas';

function contextFrom(req: Request): authService.AuthContext {
  return { requestId: req.requestId, ip: req.ip, userAgent: req.header('user-agent') };
}

export const register = asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid registration details.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const result = await authService.register(parsed.data.email, parsed.data.password, contextFrom(req));
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(201).json({ data: { user: result.user, accessToken: result.accessToken } });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, 'Invalid login details.', {
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  }

  const result = await authService.login(parsed.data.email, parsed.data.password, contextFrom(req));
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(200).json({ data: { user: result.user, accessToken: result.accessToken } });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken;
  if (!refreshToken) {
    throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED, 'No session to refresh.');
  }

  const result = await authService.refresh(refreshToken, contextFrom(req));
  setAuthCookies(res, result.accessToken, result.refreshToken);
  res.status(200).json({ data: { user: result.user, accessToken: result.accessToken } });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] ?? req.body?.refreshToken;
  if (refreshToken) {
    await authService.logout(refreshToken, req.userId ?? null, contextFrom(req));
  }
  clearAuthCookies(res);
  res.status(200).json({ data: { loggedOut: true } });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  // The `authenticate` middleware guarantees req.userId is set before this runs.
  const user = await authService.getMe(req.userId as string);
  if (!user) {
    throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED, 'Invalid or expired session. Please log in again.');
  }
  res.status(200).json({ data: { user } });
});

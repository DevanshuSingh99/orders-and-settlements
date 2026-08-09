/**
 * Cookie helpers for the auth tokens.
 *
 * We set httpOnly cookies (so client-side JS, and therefore XSS, can never
 * read the tokens) scoped to the API's own domain. Because the frontend is
 * hosted on a different origin (Cloudflare Pages) than the API, cookies
 * must be `SameSite=None; Secure` to be sent cross-site - this requires
 * HTTPS in every environment except plain localhost development.
 *
 * The API also accepts `Authorization: Bearer <token>` (see
 * middleware/authenticate.ts) so curl, Postman, and automated tests don't
 * need cookie-jar handling.
 */
import type { Response } from 'express';
import { env } from '../../config/env';

const isProduction = env.NODE_ENV === 'production';

export const ACCESS_COOKIE_NAME = 'oas_access_token';
export const REFRESH_COOKIE_NAME = 'oas_refresh_token';

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  const common = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? 'none' : 'lax') as 'none' | 'lax',
    path: '/',
  };

  res.cookie(ACCESS_COOKIE_NAME, accessToken, { ...common, maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...common,
    maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE_NAME);
  res.clearCookie(REFRESH_COOKIE_NAME);
}

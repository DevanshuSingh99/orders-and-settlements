/**
 * Business logic for authentication: register, login, refresh, logout.
 * HTTP concerns (status codes, cookies) live in controller.ts; this file
 * only knows about domain objects and throws AppError for anything the
 * client needs an actionable message for.
 */
import { randomUUID } from 'crypto';
import { AppError, AuditAction, ErrorCode, signAccessToken } from '@oas/shared-domain';
import { env } from '../../config/env';
import { writeAudit } from '../../audit/writeAudit';
import { getUserIdForRefreshSession, revokeRefreshSession, storeRefreshSession } from '../../db/redis';
import { hashPassword, verifyPassword } from './passwords';
import { createUser, findUserByEmail, findUserById } from './repository';

export interface AuthContext {
  requestId: string;
  ip?: string;
  userAgent?: string;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string };
}

const REFRESH_TTL_SECONDS = () => env.REFRESH_TTL_DAYS * 24 * 60 * 60;

function issueTokens(userId: string, email: string): { accessToken: string; refreshToken: string } {
  const accessToken = signAccessToken({
    userId,
    email,
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_ACCESS_TTL,
  });
  // Refresh tokens are opaque random strings looked up in Redis, not JWTs -
  // this lets us revoke a single session instantly (see revokeRefreshSession).
  const refreshToken = randomUUID();
  return { accessToken, refreshToken };
}

export async function register(email: string, password: string, ctx: AuthContext): Promise<AuthResult> {
  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AppError(ErrorCode.EMAIL_ALREADY_REGISTERED, 'An account with this email already exists.');
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser(email, passwordHash);

  await writeAudit({
    actorId: user.id,
    action: AuditAction.USER_REGISTERED,
    entityType: 'user',
    entityId: user.id,
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    metadata: { email: user.email },
  });

  const { accessToken, refreshToken } = issueTokens(user.id, user.email);
  await storeRefreshSession(refreshToken, user.id, REFRESH_TTL_SECONDS());

  return { accessToken, refreshToken, user: { id: user.id, email: user.email } };
}

export async function login(email: string, password: string, ctx: AuthContext): Promise<AuthResult> {
  const user = await findUserByEmail(email);
  const passwordMatches = user ? await verifyPassword(user.password_hash, password) : false;

  if (!user || !passwordMatches) {
    // Deliberately identical error whether the email doesn't exist or the
    // password is wrong, so we don't leak which emails are registered.
    await writeAudit({
      actorId: user?.id ?? null,
      action: AuditAction.USER_LOGIN_FAILED,
      entityType: 'user',
      entityId: user?.id ?? null,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      metadata: { emailAttempted: email },
    });
    throw new AppError(ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password.');
  }

  await writeAudit({
    actorId: user.id,
    action: AuditAction.USER_LOGIN,
    entityType: 'user',
    entityId: user.id,
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  const { accessToken, refreshToken } = issueTokens(user.id, user.email);
  await storeRefreshSession(refreshToken, user.id, REFRESH_TTL_SECONDS());

  return { accessToken, refreshToken, user: { id: user.id, email: user.email } };
}

export async function refresh(refreshToken: string, ctx: AuthContext): Promise<AuthResult> {
  const userId = await getUserIdForRefreshSession(refreshToken);
  if (!userId) {
    throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED, 'Session expired. Please log in again.');
  }

  const user = await findUserById(userId);
  if (!user) {
    throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED, 'Session expired. Please log in again.');
  }

  // Rotate the refresh token: revoke the old one and issue a new one, so a
  // leaked/replayed refresh token has a single-use window.
  await revokeRefreshSession(refreshToken);
  const { accessToken, refreshToken: newRefreshToken } = issueTokens(user.id, user.email);
  await storeRefreshSession(newRefreshToken, user.id, REFRESH_TTL_SECONDS());

  await writeAudit({
    actorId: user.id,
    action: AuditAction.TOKEN_REFRESHED,
    entityType: 'user',
    entityId: user.id,
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });

  return { accessToken, refreshToken: newRefreshToken, user: { id: user.id, email: user.email } };
}

export async function logout(refreshToken: string, userId: string | null, ctx: AuthContext): Promise<void> {
  await revokeRefreshSession(refreshToken);

  if (userId) {
    await writeAudit({
      actorId: userId,
      action: AuditAction.USER_LOGOUT,
      entityType: 'user',
      entityId: userId,
      requestId: ctx.requestId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    });
  }
}

export async function getMe(userId: string): Promise<{ id: string; email: string } | null> {
  const user = await findUserById(userId);
  return user ? { id: user.id, email: user.email } : null;
}

/**
 * Shared JWT helper. The auth-service is the only issuer of access tokens,
 * but the gateway and every downstream service independently verify tokens
 * with the same secret and logic - a service must never trust the gateway
 * alone to have checked authentication (see docs/implementation-plan.md
 * section 2 on the service topology).
 */
import jwt from 'jsonwebtoken';

/** Claims embedded in a normal user access token. */
export interface AccessTokenClaims {
  sub: string; // user id
  email: string;
  type: 'access';
}

export interface SignAccessTokenParams {
  userId: string;
  email: string;
  secret: string;
  expiresIn: string; // e.g. "15m"
}

export function signAccessToken(params: SignAccessTokenParams): string {
  const { userId, email, secret, expiresIn } = params;
  const payload: AccessTokenClaims = { sub: userId, email, type: 'access' };
  return jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
}

/**
 * Verifies an access token and returns its claims, or null if it is
 * missing, expired, malformed, or signed with a different secret. Callers
 * should treat `null` as "unauthenticated" and respond with
 * AUTHENTICATION_REQUIRED rather than leaking why verification failed.
 */
export function verifyAccessToken(token: string, secret: string): AccessTokenClaims | null {
  try {
    const decoded = jwt.verify(token, secret);
    if (typeof decoded === 'object' && decoded.type === 'access' && typeof decoded.sub === 'string') {
      return decoded as AccessTokenClaims;
    }
    return null;
  } catch {
    return null;
  }
}

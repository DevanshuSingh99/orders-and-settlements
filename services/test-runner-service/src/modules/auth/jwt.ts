import jwt from 'jsonwebtoken';
import { env } from '../../config/env';

export interface RunnerTokenClaims {
  sub: string;
  type: 'runner';
}

export function signRunnerToken(): string {
  const payload: RunnerTokenClaims = { sub: 'test-runner', type: 'runner' };
  return jwt.sign(payload, env.TEST_RUNNER_JWT_SECRET, {
    expiresIn: env.TEST_RUNNER_JWT_TTL,
  } as jwt.SignOptions);
}

export function verifyRunnerToken(token: string): RunnerTokenClaims | null {
  try {
    const decoded = jwt.verify(token, env.TEST_RUNNER_JWT_SECRET);
    if (typeof decoded === 'object' && decoded !== null && decoded.type === 'runner' && typeof decoded.sub === 'string') {
      return decoded as RunnerTokenClaims;
    }
    return null;
  } catch {
    return null;
  }
}

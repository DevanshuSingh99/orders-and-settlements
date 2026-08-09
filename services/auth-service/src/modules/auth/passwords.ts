/**
 * Password hashing using Argon2id - the current OWASP-recommended
 * algorithm for password storage (memory-hard, resistant to GPU cracking,
 * and the winner of the Password Hashing Competition). We never store or
 * log a plaintext password anywhere, including in audit metadata.
 */
import argon2 from 'argon2';

export function hashPassword(plainTextPassword: string): Promise<string> {
  return argon2.hash(plainTextPassword, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, plainTextPassword: string): Promise<boolean> {
  return argon2.verify(hash, plainTextPassword);
}

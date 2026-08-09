-- Users table. Passwords are never stored in plaintext - only an Argon2id
-- hash (see src/modules/auth/passwords.ts). Email is case-insensitive via
-- citext so "User@Example.com" and "user@example.com" are the same account.
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

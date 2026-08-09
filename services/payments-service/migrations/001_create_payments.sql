-- Payments are append-only: there is no UPDATE or DELETE path anywhere in
-- the application code for this table (see docs/implementation-plan.md
-- section 19 - "financial records should be append-only or reversed
-- through an explicit refund/reversal process").
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE payments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  order_id         uuid NOT NULL,
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
  payment_date     date NOT NULL,
  note             text,
  idempotency_key  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Supports "all payments for this order, most recent first" (order detail page).
CREATE INDEX idx_payments_order_date ON payments (order_id, payment_date DESC);
-- Supports "all of my payments" style queries.
CREATE INDEX idx_payments_user_created ON payments (user_id, created_at DESC);
-- Enforces idempotency: the same (user, idempotency key) pair can only
-- produce one payment, even under concurrent retries. NULL keys are
-- allowed to repeat since a payment without a key opts out of idempotency.
CREATE UNIQUE INDEX uq_payments_user_idempotency_key ON payments (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Refunds are append-only (separate from payments): positive amounts that
-- reduce orders.orders.paid_amount_cents. There is no UPDATE/DELETE path.
CREATE TABLE refunds (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  order_id         uuid NOT NULL,
  amount_cents     bigint NOT NULL CHECK (amount_cents > 0),
  refund_date      date NOT NULL,
  note             text,
  idempotency_key  text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Supports "all refunds for this order, most recent first" (order detail history).
CREATE INDEX idx_refunds_order_date ON refunds (order_id, refund_date DESC);
-- Supports "all of my refunds" style queries.
CREATE INDEX idx_refunds_user_created ON refunds (user_id, created_at DESC);
-- Same idempotency semantics as payments: one (user, key) pair → one refund.
CREATE UNIQUE INDEX uq_refunds_user_idempotency_key ON refunds (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

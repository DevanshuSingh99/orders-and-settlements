-- Orders and their line items. Money is stored as integer cents (BIGINT),
-- never floating point - see docs/implementation-plan.md section 6.
--
-- `paid_amount_cents` is a stored aggregate, not derived on every read. It
-- starts at 0 and is updated ONLY by payments-service, inside the same
-- Postgres transaction as the payment insert, via a guarded atomic UPDATE
-- (`WHERE paid_amount_cents + $amount <= total_cents`). That guard is what
-- makes the "totalPaid <= orderTotal" invariant hold even under concurrent
-- payment requests (see payments-service/src/modules/payments/service.ts).
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE orders (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL,
  customer           text NOT NULL,
  due_date           date NOT NULL,
  total_cents        bigint NOT NULL CHECK (total_cents >= 0),
  paid_amount_cents  bigint NOT NULL DEFAULT 0 CHECK (paid_amount_cents >= 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- Enforces Invariant 1 (no overpayment) at the database level as a last
  -- line of defense, in addition to the application-level guarded UPDATE.
  CONSTRAINT paid_not_over_total CHECK (paid_amount_cents <= total_cents)
);

-- Supports the default "my orders, newest first" dashboard list query.
CREATE INDEX idx_orders_user_created ON orders (user_id, created_at DESC);
-- Supports sorting/filtering by due date.
CREATE INDEX idx_orders_user_due_date ON orders (user_id, due_date);

CREATE TABLE order_line_items (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id           uuid NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  description        text NOT NULL,
  quantity           integer NOT NULL CHECK (quantity >= 1),
  unit_price_cents   bigint NOT NULL CHECK (unit_price_cents >= 0),
  line_total_cents   bigint NOT NULL CHECK (line_total_cents >= 0)
);

-- Supports "load all line items for this order" (every order detail view).
CREATE INDEX idx_line_items_order ON order_line_items (order_id);

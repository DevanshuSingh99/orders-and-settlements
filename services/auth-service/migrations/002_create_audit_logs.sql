-- Append-only audit log for auth events (USER_REGISTERED, USER_LOGIN,
-- USER_LOGIN_FAILED, USER_LOGOUT, TOKEN_REFRESHED). See
-- docs/implementation-plan.md section 6.1 - this table shape is repeated
-- identically in the orders and payments schemas. No UPDATE/DELETE is ever
-- performed against this table; only INSERT.
CREATE TABLE audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid,                          -- null when the actor is not yet known (e.g. failed login)
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid,
  request_id   text,
  metadata     jsonb NOT NULL DEFAULT '{}',
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_logs_actor ON audit_logs (actor_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs (action, created_at DESC);

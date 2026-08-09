/**
 * Canonical audit event names, shared so every service and the test suite
 * use the exact same strings. Each service only ever writes the subset
 * relevant to it, into its own `audit_logs` table (see docs/implementation-plan.md
 * section 6.1). Audit logs are append-only: there is no update/delete path.
 */
export const AuditAction = {
  // auth-service
  USER_REGISTERED: 'USER_REGISTERED',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGIN_FAILED: 'USER_LOGIN_FAILED',
  USER_LOGOUT: 'USER_LOGOUT',
  TOKEN_REFRESHED: 'TOKEN_REFRESHED',

  // orders-service
  ORDER_CREATED: 'ORDER_CREATED',
  ORDER_UPDATED: 'ORDER_UPDATED',
  ORDER_DELETED: 'ORDER_DELETED',
  ORDER_EDIT_REJECTED: 'ORDER_EDIT_REJECTED',

  // payments-service
  PAYMENT_RECORDED: 'PAYMENT_RECORDED',
  PAYMENT_REJECTED: 'PAYMENT_REJECTED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
} as const;

export type AuditActionType = (typeof AuditAction)[keyof typeof AuditAction];

export type AuditEntityType = 'user' | 'order' | 'payment' | 'refund';

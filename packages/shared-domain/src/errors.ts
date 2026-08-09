/**
 * Consistent, business-meaningful error codes shared by every service.
 *
 * Every API error response uses the same envelope:
 *   { "error": { "code": ErrorCode, "message": string, "details"?: object } }
 *
 * `AppError` is thrown from service/controller code and caught by each
 * service's error-handling middleware, which maps it to an HTTP status and
 * the envelope above. This keeps error shapes identical across the gateway,
 * auth-service, orders-service, and payments-service.
 */

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  PAYMENT_NOT_FOUND: 'PAYMENT_NOT_FOUND',
  EMAIL_ALREADY_REGISTERED: 'EMAIL_ALREADY_REGISTERED',
  PAYMENT_EXCEEDS_REMAINING_BALANCE: 'PAYMENT_EXCEEDS_REMAINING_BALANCE',
  DUPLICATE_IDEMPOTENCY_KEY: 'DUPLICATE_IDEMPOTENCY_KEY',
  INVALID_PAYMENT_AMOUNT: 'INVALID_PAYMENT_AMOUNT',
  INVALID_REFUND_AMOUNT: 'INVALID_REFUND_AMOUNT',
  REFUND_EXCEEDS_AMOUNT_PAID: 'REFUND_EXCEEDS_AMOUNT_PAID',
  ORDER_NOT_EDITABLE: 'ORDER_NOT_EDITABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Maps each error code to the HTTP status it should produce. */
const STATUS_BY_CODE: Record<ErrorCodeType, number> = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_REQUIRED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  ORDER_NOT_FOUND: 404,
  PAYMENT_NOT_FOUND: 404,
  EMAIL_ALREADY_REGISTERED: 409,
  PAYMENT_EXCEEDS_REMAINING_BALANCE: 409,
  DUPLICATE_IDEMPOTENCY_KEY: 409,
  INVALID_PAYMENT_AMOUNT: 400,
  INVALID_REFUND_AMOUNT: 400,
  REFUND_EXCEEDS_AMOUNT_PAID: 409,
  ORDER_NOT_EDITABLE: 409,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

/**
 * A business-meaningful, HTTP-mappable error. Prefer throwing this over a
 * plain `Error` anywhere a client-actionable message is possible, so the
 * frontend can render something more useful than "Something went wrong".
 */
export class AppError extends Error {
  readonly code: ErrorCodeType;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCodeType, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  /** Shapes this error into the standard `{ error: { code, message, details } }` envelope. */
  toEnvelope() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

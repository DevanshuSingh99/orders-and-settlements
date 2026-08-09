/**
 * Client-side helpers for turning API error envelopes into actionable UI copy.
 *
 * Server shape (shared-domain AppError):
 *   { error: { code, message, details? } }
 * details may include zod `fieldErrors`, export `formErrors`, or payment amount fields.
 * The API does not send a dedicated `hint`/`resolution` field — we map common codes here.
 */
import { ApiError } from "./client";
import type { FieldErrors } from "./types";

/** Short “what to do next” hints for codes the backend does not annotate. */
const HINTS: Record<string, string> = {
  NETWORK_ERROR: "Check that the API is running and your connection is working.",
  AUTHENTICATION_REQUIRED: "Sign in again to continue.",
  INVALID_CREDENTIALS: "Double-check your email and password, then try again.",
  EMAIL_ALREADY_REGISTERED: "Try logging in, or use a different email address.",
  VALIDATION_ERROR: "Fix the highlighted fields and try again.",
  PAYMENT_EXCEEDS_REMAINING_BALANCE: "Lower the amount to the remaining balance, or refresh the order first.",
  REFUND_EXCEEDS_AMOUNT_PAID: "Lower the refund to the amount already paid, or refresh the order first.",
  INVALID_PAYMENT_AMOUNT: "Use a dollar amount with at most 2 decimal places (minimum $0.01).",
  INVALID_REFUND_AMOUNT: "Use a dollar amount with at most 2 decimal places (minimum $0.01).",
  DUPLICATE_IDEMPOTENCY_KEY: "Close and reopen the form, then submit again with a fresh attempt.",
  ORDER_NOT_EDITABLE: "Line items can’t change after a payment is recorded — update customer or due date only.",
  ORDER_NOT_FOUND: "This order may have been deleted, or you don’t have access to it.",
  PAYMENT_NOT_FOUND: "Refresh the order and try again.",
  RATE_LIMITED: "Wait a moment, then retry.",
  INTERNAL_ERROR: "If this keeps happening, wait a bit and try again.",
  NOT_FOUND: "The requested resource was not found.",
  FORBIDDEN: "You don’t have permission to do that.",
};

export function getErrorHint(code: string): string | undefined {
  return HINTS[code];
}

export function getFieldErrors(err: unknown): FieldErrors {
  if (!(err instanceof ApiError)) return {};
  const raw = err.details?.fieldErrors;
  if (!raw || typeof raw !== "object") return {};
  return raw as FieldErrors;
}

/** Flatten zod-style fieldErrors into short human lines for banners/lists. */
export function flattenFieldErrorMessages(fieldErrors: FieldErrors, limit = 8): string[] {
  const out: string[] = [];
  for (const [field, msgs] of Object.entries(fieldErrors)) {
    if (!Array.isArray(msgs)) continue;
    for (const msg of msgs) {
      if (!msg) continue;
      // Zod often returns "Required" — prefix the field so it's actionable.
      const line =
        msg === "Required" || msg === "Required."
          ? `${field} is required.`
          : msg.toLowerCase().includes(field.toLowerCase())
            ? msg
            : `${field}: ${msg}`;
      out.push(line);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function firstFieldMessage(fieldErrors: FieldErrors, field: string): string | undefined {
  const msgs = fieldErrors[field];
  return Array.isArray(msgs) && msgs.length > 0 ? String(msgs[0]) : undefined;
}

/** Also pick up non-field detail lists (e.g. formErrors on export). */
function detailStringList(details: ApiError["details"], key: string): string[] {
  const value = details?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export interface FormattedApiError {
  message: string;
  hint?: string;
  code: string;
  fieldErrors: FieldErrors;
  /** Banner-ready single string: message + field snippets (no hint — keep hint separate in UI). */
  summary: string;
}

/**
 * Prefer the server `message`, then surface field/form details, then a client hint.
 * Never invents a success — unknown errors fall back to a generic retry message.
 */
export function formatApiError(
  err: unknown,
  fallback = "Something went wrong. Please try again.",
): FormattedApiError {
  if (!(err instanceof ApiError)) {
    const message = err instanceof Error && err.message.trim() ? err.message : fallback;
    return { message, code: "INTERNAL_ERROR", fieldErrors: {}, summary: message };
  }

  const fieldErrors = getFieldErrors(err);
  const fieldMsgs = flattenFieldErrorMessages(fieldErrors);
  const formMsgs = detailStringList(err.details, "formErrors");
  const detailMsgs = detailStringList(err.details, "errors");
  const hint = getErrorHint(err.code);

  const message = err.message?.trim() || fallback;
  const extras = [...fieldMsgs, ...formMsgs, ...detailMsgs].filter((line) => !message.includes(line));

  const summary = extras.length > 0 ? `${message} ${extras.slice(0, 4).join(" ")}` : message;

  return {
    message,
    hint,
    code: err.code,
    fieldErrors,
    summary,
  };
}

/** Single string for compact inline spots (includes hint). */
export function apiErrorDisplay(err: unknown, fallback?: string): string {
  const formatted = formatApiError(err, fallback);
  if (formatted.hint && !formatted.summary.includes(formatted.hint)) {
    return `${formatted.summary} ${formatted.hint}`;
  }
  return formatted.summary;
}

export function isAuthenticationError(err: unknown): boolean {
  return err instanceof ApiError && err.code === "AUTHENTICATION_REQUIRED";
}

export function isSessionAbsentError(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === "AUTHENTICATION_REQUIRED" || err.code === "INVALID_CREDENTIALS")
  );
}

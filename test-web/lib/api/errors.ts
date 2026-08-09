/**
 * Client helpers for test-runner API errors.
 * Server envelope matches shared-domain AppError:
 *   { error: { code, message, details? } }
 * Load validation may put string[] in `details.errors`; suite/login use `fieldErrors`.
 */
import { ApiError } from "./client";

const HINTS: Record<string, string> = {
  NETWORK_ERROR: "Check that the test-runner is running and reachable.",
  AUTHENTICATION_REQUIRED: "Your session expired — sign in again.",
  INVALID_CREDENTIALS: "Double-check the gate username and password.",
  VALIDATION_ERROR: "Fix the invalid fields or profile values, then retry.",
  RATE_LIMITED: "Wait a moment (or finish the active run), then retry.",
  NOT_FOUND: "That run may have expired — start a new one.",
  INTERNAL_ERROR: "If this keeps happening, check the test-runner logs.",
};

export type FieldErrors = Record<string, string[] | undefined>;

export function getErrorHint(code: string): string | undefined {
  return HINTS[code];
}

export function getFieldErrors(err: unknown): FieldErrors {
  if (!(err instanceof ApiError)) return {};
  const raw = err.details?.fieldErrors;
  if (!raw || typeof raw !== "object") return {};
  return raw as FieldErrors;
}

export function flattenFieldErrorMessages(fieldErrors: FieldErrors, limit = 8): string[] {
  const out: string[] = [];
  for (const [field, msgs] of Object.entries(fieldErrors)) {
    if (!Array.isArray(msgs)) continue;
    for (const msg of msgs) {
      if (!msg) continue;
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

export interface FormattedApiError {
  message: string;
  hint?: string;
  code: string;
  fieldErrors: FieldErrors;
  summary: string;
}

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
  const detailErrors = Array.isArray(err.details?.errors)
    ? (err.details!.errors as unknown[]).filter((item): item is string => typeof item === "string")
    : [];

  const message = err.message?.trim() || fallback;
  const extras = [...fieldMsgs, ...detailErrors].filter((line) => !message.includes(line));
  const summary = extras.length > 0 ? `${message} ${extras.slice(0, 4).join(" ")}` : message;

  return {
    message,
    hint: getErrorHint(err.code),
    code: err.code,
    fieldErrors,
    summary,
  };
}

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

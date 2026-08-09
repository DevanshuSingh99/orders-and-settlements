/**
 * Central HTTP client for the API. Every screen goes through here so that
 * error parsing, credentials, and the payment idempotency key are handled
 * in exactly one place instead of being re-implemented per screen.
 *
 * Authentication uses the httpOnly cookie set by auth-service - we never
 * store the access token in JavaScript (see docs/implementation-plan.md
 * section 9), so every request is sent with `credentials: "include"` and
 * the browser attaches the cookie automatically.
 */
import type { FieldErrors } from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

/** Thrown for any non-2xx API response. Carries the server's error code/message/details verbatim. */
export class ApiError extends Error {
  code: string;
  details?: { fieldErrors?: FieldErrors; [key: string]: unknown };

  constructor(code: string, message: string, details?: ApiError["details"]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

type AuthFailureListener = () => void;
let authFailureListener: AuthFailureListener | null = null;

/** Register a single listener for mid-session AUTHENTICATION_REQUIRED responses. */
export function onAuthFailure(listener: AuthFailureListener): () => void {
  authFailureListener = listener;
  return () => {
    if (authFailureListener === listener) authFailureListener = null;
  };
}

function notifyAuthFailure(code: string) {
  if (code === "AUTHENTICATION_REQUIRED") {
    authFailureListener?.();
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Sent as the Idempotency-Key header - used for payment and refund creation. */
  idempotencyKey?: string;
}

function parseErrorPayload(payload: unknown): { code: string; message: string; details?: ApiError["details"] } {
  const error =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: string; message?: string; details?: ApiError["details"] } }).error
      : undefined;

  return {
    code: typeof error?.code === "string" && error.code ? error.code : "INTERNAL_ERROR",
    message:
      typeof error?.message === "string" && error.message.trim()
        ? error.message
        : "Something went wrong. Please try again.",
    details: error?.details,
  };
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Network failure (server down, CORS, offline) - never a silent failure.
    throw new ApiError("NETWORK_ERROR", "Could not reach the server. Check your connection and try again.");
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const parsed = parseErrorPayload(payload);
    notifyAuthFailure(parsed.code);
    throw new ApiError(parsed.code, parsed.message, parsed.details);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) =>
    apiFetch<T>(path, { method: "POST", body, idempotencyKey }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

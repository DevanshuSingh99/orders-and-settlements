/**
 * HTTP client for the test-runner service. Auth is a short-lived JWT held in
 * React memory (not cookies) — callers pass the token explicitly.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_TEST_API_BASE_URL ?? "http://localhost:4004";

export function getTestApiBaseUrl(): string {
  return API_BASE_URL.replace(/\/$/, "");
}

export class ApiError extends Error {
  code: string;
  details?: { fieldErrors?: Record<string, string[]>; errors?: string[]; [key: string]: unknown };

  constructor(code: string, message: string, details?: ApiError["details"]) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.details = details;
  }
}

type AuthFailureListener = () => void;
let authFailureListener: AuthFailureListener | null = null;

/** Register a listener for mid-session AUTHENTICATION_REQUIRED responses. */
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
  token?: string | null;
}

function parseErrorPayload(payload: unknown): {
  code: string;
  message: string;
  details?: ApiError["details"];
} {
  const error =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as { error?: { code?: string; message?: string; details?: ApiError["details"] } }).error
      : undefined;

  const details = error?.details;
  const detailErrors = Array.isArray(details?.errors) ? (details.errors as string[]) : [];
  const fieldErrors =
    details?.fieldErrors && typeof details.fieldErrors === "object"
      ? (details.fieldErrors as Record<string, string[]>)
      : undefined;

  // Flatten field errors into the thrown message so callers that only show
  // `err.message` still get actionable validation text.
  const fieldLines: string[] = [];
  if (fieldErrors) {
    for (const [field, msgs] of Object.entries(fieldErrors)) {
      if (!Array.isArray(msgs)) continue;
      for (const msg of msgs) {
        if (!msg) continue;
        fieldLines.push(msg === "Required" || msg === "Required." ? `${field} is required.` : msg);
      }
    }
  }

  const baseMessage =
    typeof error?.message === "string" && error.message.trim()
      ? error.message
      : "Something went wrong. Please try again.";

  const extras = [...detailErrors, ...fieldLines].filter((line) => !baseMessage.includes(line));
  const message = extras.length > 0 ? `${baseMessage} ${extras.slice(0, 4).join(" ")}` : baseMessage;

  return {
    code: typeof error?.code === "string" && error.code ? error.code : "INTERNAL_ERROR",
    message,
    details,
  };
}

async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${getTestApiBaseUrl()}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError("NETWORK_ERROR", "Could not reach the test-runner. Is it running?");
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
  get: <T>(path: string, token?: string | null) => apiFetch<T>(path, { token }),
  post: <T>(path: string, body?: unknown, token?: string | null) =>
    apiFetch<T>(path, { method: "POST", body, token }),
};

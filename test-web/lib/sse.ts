import { getTestApiBaseUrl } from "./api/client";

/**
 * Open an SSE stream. EventSource cannot set Authorization headers, so the
 * runner JWT is passed as `?token=` (same pattern as the API contract).
 *
 * Events are expected as JSON in `event.data`, with `event.type` matching the
 * payload's `type` field when the server sets named events.
 *
 * `onError` receives a short human message when the stream fails to stay open
 * (auth failure, runner down, etc.). Transient reconnects are debounced so a
 * brief blip does not wipe a healthy run.
 */
export function openSseStream<T extends { type: string }>(
  path: string,
  token: string,
  handlers: {
    onEvent: (event: T) => void;
    onError?: (message: string) => void;
    onOpen?: () => void;
  },
): () => void {
  const url = new URL(`${getTestApiBaseUrl()}${path}`);
  url.searchParams.set("token", token);

  const source = new EventSource(url.toString());
  let opened = false;
  let closedByClient = false;
  let errorTimer: ReturnType<typeof setTimeout> | null = null;

  const clearErrorTimer = () => {
    if (errorTimer !== null) {
      clearTimeout(errorTimer);
      errorTimer = null;
    }
  };

  source.onopen = () => {
    opened = true;
    clearErrorTimer();
    handlers.onOpen?.();
  };

  const dispatch = (parsed: T, fallbackType?: string) => {
    clearErrorTimer();
    if (!parsed.type && fallbackType) {
      handlers.onEvent({ ...parsed, type: fallbackType } as T);
    } else {
      handlers.onEvent(parsed);
    }
  };

  source.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data) as T;
      dispatch(parsed);
    } catch {
      // Ignore malformed frames; the UI stays on the last good state.
    }
  };

  // Named SSE events (`event: run.finished`) also land here when registered.
  const namedTypes = [
    "run.snapshot",
    "run.started",
    "scenario.started",
    "step.started",
    "step.finished",
    "scenario.finished",
    "run.finished",
    "run.error",
    "load.started",
    "load.progress",
    "load.finished",
    "load.error",
  ];

  for (const type of namedTypes) {
    source.addEventListener(type, (message) => {
      const data = (message as MessageEvent).data;
      try {
        const parsed = JSON.parse(String(data)) as T;
        dispatch(parsed, type);
      } catch {
        // ignore
      }
    });
  }

  source.onerror = () => {
    if (closedByClient) return;
    // EventSource retries on transient drops. Only surface a user-visible
    // error if the connection does not recover shortly.
    if (errorTimer !== null) return;
    errorTimer = setTimeout(() => {
      if (closedByClient) return;
      const message = opened
        ? "Lost connection to the live stream. The run may still be in progress — check the test-runner and try again."
        : "Could not connect to the live stream. Check that the test-runner is running and your session is still valid.";
      handlers.onError?.(message);
      closedByClient = true;
      source.close();
    }, 2500);
  };

  return () => {
    closedByClient = true;
    clearErrorTimer();
    source.close();
  };
}

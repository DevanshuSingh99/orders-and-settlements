import { EventEmitter } from 'events';

/** In-process fan-out for SSE subscribers (single-instance deployment). */
export const runEvents = new EventEmitter();
runEvents.setMaxListeners(100);

export type RunEvent = {
  type: string;
  runId: string;
  at: string;
  [key: string]: unknown;
};

export function emitRunEvent(event: RunEvent): void {
  runEvents.emit(event.runId, event);
  runEvents.emit('*', event);
}

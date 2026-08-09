import type { Request, Response } from 'express';
import { runEvents, type RunEvent } from '../engine/events';
import { getRun } from '../engine/runStore';

/** Subscribe to run events; sends a snapshot first, then live SSE frames. */
export async function streamRun(req: Request, res: Response, runId: string): Promise<void> {
  const run = await getRun(runId);
  if (!run) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Run not found.' } });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const write = (event: RunEvent | { type: string; run: unknown }) => {
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  write({ type: 'run.snapshot', run });

  const onEvent = (event: RunEvent) => {
    write(event);
    if (event.type === 'run.finished' || event.type === 'load.finished') {
      // Keep connection briefly so clients receive the terminal event, then end.
      setTimeout(() => {
        res.end();
      }, 50);
    }
  };

  runEvents.on(runId, onEvent);

  // If already finished when client connects, close after snapshot.
  if (run.status === 'finished' || run.status === 'failed') {
    setTimeout(() => res.end(), 50);
  }

  req.on('close', () => {
    runEvents.off(runId, onEvent);
  });
}

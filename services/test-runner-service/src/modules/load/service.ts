import { randomUUID } from 'crypto';
import { AppError, ErrorCode } from '@oas/shared-domain';
import { executeLoadRun } from '../../engine/loadExecutor';
import { estimateTotalOps, type LoadProfile } from '../../engine/loadProfile';
import {
  anyRunActive,
  appendEvent,
  getRun,
  releaseActiveLock,
  saveRun,
  tryAcquireActiveLock,
  type LoadRunRecord,
} from '../../engine/runStore';
import { logger } from '../../config/logger';

export async function startLoadRun(profile: LoadProfile): Promise<LoadRunRecord> {
  if (await anyRunActive()) {
    throw new AppError(
      ErrorCode.RATE_LIMITED,
      'Another suite or load run is already active. Wait for it to finish.',
    );
  }

  const runId = randomUUID();
  const locked = await tryAcquireActiveLock(runId, 'load');
  if (!locked) {
    throw new AppError(ErrorCode.RATE_LIMITED, 'A load run is already active.');
  }

  const now = new Date().toISOString();
  const run: LoadRunRecord = {
    id: runId,
    kind: 'load',
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    profile,
    completedOps: 0,
    totalOps: estimateTotalOps(profile),
    recentErrors: [],
    events: [],
  };
  await saveRun(run);

  void executeLoad(runId, profile).catch((err) => {
    logger.error({ err, runId }, 'Load run crashed');
  });

  return run;
}

async function executeLoad(runId: string, profile: LoadProfile): Promise<void> {
  const run = (await getRun(runId)) as LoadRunRecord | null;
  if (!run) {
    await releaseActiveLock(runId);
    return;
  }

  run.status = 'running';
  await saveRun(run);

  await appendEvent(runId, {
    type: 'run.started',
    runId,
    at: new Date().toISOString(),
    kind: 'load',
    profile,
  });

  try {
    const summary = await executeLoadRun(profile, async (progress) => {
      const current = (await getRun(runId)) as LoadRunRecord | null;
      if (!current) return;
      current.completedOps = progress.completedOps;
      current.totalOps = progress.totalOps;
      current.phase = progress.phase;
      current.recentErrors = progress.recentErrors;
      if (progress.summary) current.summary = progress.summary;
      if (progress.error) current.error = progress.error;
      await saveRun(current);

      await appendEvent(runId, {
        type: progress.type,
        runId,
        at: new Date().toISOString(),
        phase: progress.phase,
        completedOps: progress.completedOps,
        totalOps: progress.totalOps,
        successCount: progress.successCount,
        failCount: progress.failCount,
        statusHistogram: progress.statusHistogram,
        recentErrors: progress.recentErrors,
        topErrors: progress.topErrors,
        byOperation: progress.byOperation,
        summary: progress.summary,
        error: progress.error,
      });
    });

    const final = (await getRun(runId)) as LoadRunRecord;
    final.status = summary.status === 'passed' ? 'finished' : 'failed';
    final.summary = summary;
    await saveRun(final);

    await appendEvent(runId, {
      type: 'run.finished',
      runId,
      at: new Date().toISOString(),
      kind: 'load',
      summary,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const final = (await getRun(runId)) as LoadRunRecord;
    final.status = 'failed';
    final.error = message;
    await saveRun(final);
    await appendEvent(runId, {
      type: 'run.finished',
      runId,
      at: new Date().toISOString(),
      kind: 'load',
      error: message,
    });
  } finally {
    await releaseActiveLock(runId);
  }
}

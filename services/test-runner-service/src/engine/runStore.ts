import { ACTIVE_RUN_LOCK_KEY, redis, RUN_TTL_SECONDS, runKey } from '../db/redis';
import { emitRunEvent, type RunEvent } from './events';
import type { LoadErrorSample, LoadSummary } from './loadExecutor';
import type { ScenarioResult } from './scenarioExecutor';
import type { LoadProfile } from './loadProfile';

export type RunKind = 'suite' | 'load';
export type RunStatus = 'queued' | 'running' | 'finished' | 'failed';

export interface SuiteRunRecord {
  id: string;
  kind: 'suite';
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  suites?: string[];
  scenarios: ScenarioResult[];
  summary?: {
    total: number;
    passed: number;
    failed: number;
    durationMs: number;
  };
  events: RunEvent[];
  error?: string;
}

export interface LoadRunRecord {
  id: string;
  kind: 'load';
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  profile: LoadProfile;
  completedOps: number;
  totalOps: number;
  phase?: string;
  recentErrors: LoadErrorSample[];
  summary?: LoadSummary;
  events: RunEvent[];
  error?: string;
}

export type RunRecord = SuiteRunRecord | LoadRunRecord;

export async function saveRun(run: RunRecord): Promise<void> {
  run.updatedAt = new Date().toISOString();
  await redis.set(runKey(run.id), JSON.stringify(run), 'EX', RUN_TTL_SECONDS);
}

export async function getRun(runId: string): Promise<RunRecord | null> {
  const raw = await redis.get(runKey(runId));
  if (!raw) return null;
  return JSON.parse(raw) as RunRecord;
}

export async function appendEvent(runId: string, event: RunEvent): Promise<void> {
  const run = await getRun(runId);
  if (!run) return;
  run.events.push(event);
  // Cap stored events to keep Redis payloads reasonable.
  if (run.events.length > 2000) {
    run.events = run.events.slice(-1500);
  }
  await saveRun(run);
  emitRunEvent(event);
}

/** Acquire single-flight lock. Returns false if any run is already active. */
export async function tryAcquireActiveLock(runId: string, kind: RunKind): Promise<boolean> {
  // NX + EX: only one active run at a time for load starts (and we use the same
  // lock when suite runs want exclusive cleanup coordination for load gates).
  const result = await redis.set(ACTIVE_RUN_LOCK_KEY, JSON.stringify({ runId, kind }), 'EX', LOAD_LOCK_TTL, 'NX');
  return result === 'OK';
}

/** Suite runs take a soft presence key so load can detect them; multiple suite keys allowed via set. */
const SUITE_ACTIVE_SET = 'testrunner:active-suites';
const LOAD_LOCK_TTL = 11 * 60; // slightly over max load timeout

export async function markSuiteActive(runId: string): Promise<void> {
  await redis.sadd(SUITE_ACTIVE_SET, runId);
  await redis.expire(SUITE_ACTIVE_SET, RUN_TTL_SECONDS);
}

export async function markSuiteInactive(runId: string): Promise<void> {
  await redis.srem(SUITE_ACTIVE_SET, runId);
}

export async function anyRunActive(): Promise<boolean> {
  const lock = await redis.get(ACTIVE_RUN_LOCK_KEY);
  if (lock) return true;
  const suiteCount = await redis.scard(SUITE_ACTIVE_SET);
  return suiteCount > 0;
}

export async function releaseActiveLock(runId: string): Promise<void> {
  const raw = await redis.get(ACTIVE_RUN_LOCK_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { runId?: string };
    if (parsed.runId === runId) {
      await redis.del(ACTIVE_RUN_LOCK_KEY);
    }
  } catch {
    await redis.del(ACTIVE_RUN_LOCK_KEY);
  }
}

import { randomUUID } from 'crypto';
import { orderBody, paymentBody } from '@oas/test-scenarios';
import { apiFetch } from './apiClient';
import { cleanupUsers } from './cleanup';
import { estimateTotalOps, LOAD_LIMITS, type LoadProfile } from './loadProfile';

export type LoadPhase = 'register' | 'orders' | 'payments' | 'burst' | 'cleanup' | 'done';

export type LoadOperation =
  | 'register'
  | 'create_order'
  | 'partial_payment'
  | 'pay_remaining'
  | 'burst_order'
  | 'burst_payment';

export interface LoadErrorSample {
  status: number;
  operation: LoadOperation;
  path: string;
  message: string;
}

export interface LoadErrorGroup {
  status: number;
  operation: LoadOperation;
  message: string;
  count: number;
}

export interface LoadOperationStats {
  operation: LoadOperation;
  success: number;
  fail: number;
}

export interface LatencyBucket {
  /**
   * Inclusive upper bound in ms.
   * Last bucket uses LATENCY_INF_LE (-1) meaning “above previous bound”
   * (JSON cannot round-trip Infinity).
   */
  le: number;
  count: number;
}

/** Wire sentinel for the open-ended latency histogram bucket. */
export const LATENCY_INF_LE = -1;

export interface LoadProgressEvent {
  type: 'load.progress' | 'load.finished' | 'load.error';
  phase: LoadPhase;
  completedOps: number;
  totalOps: number;
  successCount: number;
  failCount: number;
  statusHistogram: Record<string, number>;
  recentErrors: LoadErrorSample[];
  topErrors: LoadErrorGroup[];
  byOperation: LoadOperationStats[];
  summary?: LoadSummary;
  error?: string;
}

export interface LoadSummary {
  status: 'passed' | 'failed' | 'timeout';
  durationMs: number;
  successCount: number;
  failCount: number;
  statusHistogram: Record<string, number>;
  latencyMs: { p50: number; p95: number; p99: number; avg: number };
  latencyHistogram: LatencyBucket[];
  topErrors: LoadErrorGroup[];
  byOperation: LoadOperationStats[];
  recentErrors: LoadErrorSample[];
  phase: LoadPhase;
  completedOps: number;
  totalOps: number;
}

/** Fixed latency histogram bounds (ms). Final bucket is +Inf. */
export const LATENCY_BOUNDS_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;

const MAX_RECENT_ERRORS = 50;
const MAX_TOP_ERRORS = 20;
const EMIT_RECENT_ERRORS = 10;

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

function sleep(ms: number): Promise<void> {
  return ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));
}

/** Pull a short, human-readable error from API bodies; redact secrets. */
export function extractErrorMessage(body: unknown, fallback: string): string {
  let raw = fallback;
  if (body && typeof body === 'object') {
    const err = (body as { error?: { message?: string; code?: string } }).error;
    if (err?.message) {
      raw = err.code ? `${err.code}: ${err.message}` : err.message;
    } else {
      try {
        raw = JSON.stringify(body);
      } catch {
        raw = fallback;
      }
    }
  }
  return sanitizeMessage(raw);
}

export function sanitizeMessage(message: string): string {
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, '[REDACTED_JWT]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[email]')
    .replace(/"password"\s*:\s*"[^"]*"/gi, '"password":"[REDACTED]"')
    .slice(0, 200);
}

export function buildLatencyHistogram(latencies: number[]): LatencyBucket[] {
  const counts = new Array(LATENCY_BOUNDS_MS.length + 1).fill(0) as number[];
  for (const ms of latencies) {
    let placed = false;
    for (let i = 0; i < LATENCY_BOUNDS_MS.length; i++) {
      if (ms <= LATENCY_BOUNDS_MS[i]) {
        counts[i] += 1;
        placed = true;
        break;
      }
    }
    if (!placed) counts[LATENCY_BOUNDS_MS.length] += 1;
  }
  return [
    ...LATENCY_BOUNDS_MS.map((le, i) => ({ le, count: counts[i] })),
    { le: LATENCY_INF_LE, count: counts[LATENCY_BOUNDS_MS.length] },
  ];
}

function errorGroupKey(status: number, operation: LoadOperation, message: string): string {
  return `${status}|${operation}|${message}`;
}

function rankTopErrors(
  counts: Map<string, LoadErrorGroup>,
  limit = MAX_TOP_ERRORS,
): LoadErrorGroup[] {
  return [...counts.values()].sort((a, b) => b.count - a.count || a.status - b.status).slice(0, limit);
}

function operationStatsList(
  stats: Record<LoadOperation, { success: number; fail: number }>,
): LoadOperationStats[] {
  const order: LoadOperation[] = [
    'register',
    'create_order',
    'partial_payment',
    'pay_remaining',
    'burst_order',
    'burst_payment',
  ];
  return order
    .filter((op) => stats[op].success > 0 || stats[op].fail > 0)
    .map((operation) => ({
      operation,
      success: stats[operation].success,
      fail: stats[operation].fail,
    }));
}

class WorkerPool {
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(private concurrency: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await fn();
    } finally {
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

export async function executeLoadRun(
  profile: LoadProfile,
  onProgress: (event: LoadProgressEvent) => void,
): Promise<LoadSummary> {
  const started = Date.now();
  const totalOps = estimateTotalOps(profile);
  const latencies: number[] = [];
  const statusHistogram: Record<string, number> = {};
  let successCount = 0;
  let failCount = 0;
  let completedOps = 0;
  let phase: LoadPhase = 'register';
  const recentErrors: LoadErrorSample[] = [];
  const errorGroups = new Map<string, LoadErrorGroup>();
  const opStats: Record<LoadOperation, { success: number; fail: number }> = {
    register: { success: 0, fail: 0 },
    create_order: { success: 0, fail: 0 },
    partial_payment: { success: 0, fail: 0 },
    pay_remaining: { success: 0, fail: 0 },
    burst_order: { success: 0, fail: 0 },
    burst_payment: { success: 0, fail: 0 },
  };
  const userIds: string[] = [];
  let lastEmitAt = 0;
  let opsSinceEmit = 0;
  let timedOut = false;

  const deadline = started + LOAD_LIMITS.maxTimeoutMs;

  const snapshotErrors = () => ({
    statusHistogram: { ...statusHistogram },
    recentErrors: recentErrors.slice(-EMIT_RECENT_ERRORS),
    topErrors: rankTopErrors(errorGroups),
    byOperation: operationStatsList(opStats),
  });

  const emitProgress = (force = false) => {
    const now = Date.now();
    if (!force && opsSinceEmit < 25 && now - lastEmitAt < 500) return;
    lastEmitAt = now;
    opsSinceEmit = 0;
    const snap = snapshotErrors();
    onProgress({
      type: 'load.progress',
      phase,
      completedOps,
      totalOps,
      successCount,
      failCount,
      ...snap,
    });
  };

  const record = (
    status: number,
    operation: LoadOperation,
    path: string,
    durationMs: number,
    ok: boolean,
    message?: string,
  ) => {
    completedOps += 1;
    opsSinceEmit += 1;
    latencies.push(durationMs);
    statusHistogram[String(status)] = (statusHistogram[String(status)] ?? 0) + 1;
    if (ok) {
      successCount += 1;
      opStats[operation].success += 1;
    } else {
      failCount += 1;
      opStats[operation].fail += 1;
      const sample: LoadErrorSample = {
        status,
        operation,
        path,
        message: sanitizeMessage(message ?? `HTTP ${status}`),
      };
      recentErrors.push(sample);
      if (recentErrors.length > MAX_RECENT_ERRORS) recentErrors.shift();

      const key = errorGroupKey(sample.status, sample.operation, sample.message);
      const existing = errorGroups.get(key);
      if (existing) existing.count += 1;
      else errorGroups.set(key, { ...sample, count: 1 });
    }
    emitProgress();
  };

  const checkTimeout = () => {
    if (Date.now() > deadline) {
      timedOut = true;
      throw new Error('Load run exceeded 10 minute wall-clock timeout');
    }
  };

  const pool = new WorkerPool(profile.concurrency);

  const buildSummary = (status: LoadSummary['status']): LoadSummary => {
    const sorted = [...latencies].sort((a, b) => a - b);
    const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const snap = snapshotErrors();
    return {
      status,
      durationMs: Date.now() - started,
      successCount,
      failCount,
      statusHistogram,
      latencyMs: {
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        avg: Math.round(avg * 100) / 100,
      },
      latencyHistogram: buildLatencyHistogram(latencies),
      topErrors: snap.topErrors,
      byOperation: snap.byOperation,
      recentErrors: recentErrors.slice(-EMIT_RECENT_ERRORS),
      phase,
      completedOps,
      totalOps,
    };
  };

  try {
    // --- register ---
    phase = 'register';
    emitProgress(true);
    const tokens: string[] = [];
    for (let i = 0; i < profile.users; i++) {
      checkTimeout();
      const email = `loadtest+${randomUUID()}@test.local`;
      const password = `T${randomUUID().replace(/-/g, '')}!a1`;
      const path = '/api/auth/register';
      const res = await apiFetch({
        method: 'POST',
        path,
        body: { email, password },
      });
      const ok = res.status === 201;
      record(
        res.status,
        'register',
        path,
        res.durationMs,
        ok,
        ok ? undefined : extractErrorMessage(res.body, `HTTP ${res.status}`),
      );
      if (!ok) {
        throw new Error(`Failed to register ephemeral user (${res.status})`);
      }
      const data = res.body as { data?: { user?: { id?: string }; accessToken?: string } };
      const userId = data.data?.user?.id;
      const accessToken = data.data?.accessToken;
      if (!userId || !accessToken) {
        throw new Error('Register response missing user id or access token');
      }
      userIds.push(userId);
      tokens.push(accessToken);
      await sleep(profile.thinkTimeMs);
    }

    // --- orders ---
    phase = 'orders';
    emitProgress(true);
    const orderIds: string[] = [];
    const orderJobs: Promise<void>[] = [];
    for (let i = 0; i < profile.orders.count; i++) {
      const token = tokens[i % tokens.length];
      orderJobs.push(
        pool.run(async () => {
          checkTimeout();
          const path = '/api/orders';
          const body = orderBody({
            customer: `Load ${i}`,
            total: profile.orders.total,
            dueInDays: profile.orders.dueInDays,
          });
          const res = await apiFetch({ method: 'POST', path, body, accessToken: token });
          const ok = res.status === 201;
          if (ok) {
            const id = (res.body as { data?: { id?: string } })?.data?.id;
            if (id) orderIds.push(id);
          }
          record(
            res.status,
            'create_order',
            path,
            res.durationMs,
            ok,
            ok ? undefined : extractErrorMessage(res.body, `HTTP ${res.status}`),
          );
          await sleep(profile.thinkTimeMs);
        }),
      );
    }
    await Promise.all(orderJobs);

    // --- payments ---
    phase = 'payments';
    emitProgress(true);
    const partialCount = Math.ceil(profile.orders.count * profile.payments.partialFraction);
    const paymentJobs: Promise<void>[] = [];
    const partialAmount = Math.round(profile.orders.total * 0.4 * 100) / 100;

    for (let i = 0; i < Math.min(partialCount, orderIds.length); i++) {
      const orderId = orderIds[i];
      const token = tokens[i % tokens.length];
      paymentJobs.push(
        pool.run(async () => {
          checkTimeout();
          const path = `/api/orders/${orderId}/payments`;
          const res = await apiFetch({
            method: 'POST',
            path,
            body: paymentBody(partialAmount),
            accessToken: token,
          });
          const ok = res.status === 201;
          record(
            res.status,
            'partial_payment',
            '/api/orders/:id/payments',
            res.durationMs,
            ok,
            ok ? undefined : extractErrorMessage(res.body, `HTTP ${res.status}`),
          );
          await sleep(profile.thinkTimeMs);
        }),
      );
    }
    await Promise.all(paymentJobs);

    if (profile.payments.payRemainingOnHalf) {
      const remainingJobs: Promise<void>[] = [];
      const half = Math.floor(Math.min(partialCount, orderIds.length) / 2);
      const remainingAmount = Math.round((profile.orders.total - partialAmount) * 100) / 100;
      for (let i = 0; i < half; i++) {
        const orderId = orderIds[i];
        const token = tokens[i % tokens.length];
        remainingJobs.push(
          pool.run(async () => {
            checkTimeout();
            const path = `/api/orders/${orderId}/payments`;
            const res = await apiFetch({
              method: 'POST',
              path,
              body: paymentBody(remainingAmount),
              accessToken: token,
            });
            const ok = res.status === 201;
            record(
              res.status,
              'pay_remaining',
              '/api/orders/:id/payments',
              res.durationMs,
              ok,
              ok ? undefined : extractErrorMessage(res.body, `HTTP ${res.status}`),
            );
            await sleep(profile.thinkTimeMs);
          }),
        );
      }
      await Promise.all(remainingJobs);
    }

    // --- burst ---
    if (profile.burst.enabled && orderIds.length > 0) {
      phase = 'burst';
      emitProgress(true);
      const token = tokens[0];
      // Fresh order sized for the burst race so earlier payments don't interfere.
      const burstOrderRes = await apiFetch({
        method: 'POST',
        path: '/api/orders',
        body: orderBody({
          customer: 'Burst Co',
          total: profile.burst.amount * profile.burst.parallel,
          dueInDays: profile.orders.dueInDays,
        }),
        accessToken: token,
      });
      const burstOrderId =
        burstOrderRes.status === 201
          ? (burstOrderRes.body as { data?: { id?: string } })?.data?.id
          : undefined;

      if (burstOrderId) {
        // Burst order create is scaffolding (not in totalOps estimate); only race payments count.
        const burstPays = Array.from({ length: profile.burst.parallel }, (_, idx) =>
          pool.run(async () => {
            checkTimeout();
            const path = `/api/orders/${burstOrderId}/payments`;
            const res = await apiFetch({
              method: 'POST',
              path,
              body: paymentBody(profile.burst.amount, `burst-${idx}`),
              accessToken: token,
            });
            // In a race, some 409s are expected — still record latency.
            const ok = res.status === 201 || res.status === 409;
            record(
              res.status,
              'burst_payment',
              '/api/orders/:id/payments',
              res.durationMs,
              ok,
              ok ? undefined : extractErrorMessage(res.body, `HTTP ${res.status}`),
            );
          }),
        );
        await Promise.all(burstPays);
      } else {
        // Keep ops accounting aligned with estimate (parallel slots), surface create failure once.
        const createMsg = extractErrorMessage(burstOrderRes.body, 'burst order create failed');
        opStats.burst_order.fail += 1;
        const createKey = errorGroupKey(burstOrderRes.status, 'burst_order', createMsg);
        const existing = errorGroups.get(createKey);
        if (existing) existing.count += 1;
        else {
          errorGroups.set(createKey, {
            status: burstOrderRes.status,
            operation: 'burst_order',
            message: createMsg,
            count: 1,
          });
        }
        for (let i = 0; i < profile.burst.parallel; i++) {
          record(
            burstOrderRes.status,
            'burst_payment',
            '/api/orders',
            burstOrderRes.durationMs,
            false,
            createMsg,
          );
        }
      }
    }

    phase = 'cleanup';
    emitProgress(true);
    await cleanupUsers({ userIds, emailPrefixes: ['loadtest+'] });
    phase = 'done';

    const summary = buildSummary(failCount > 0 && successCount === 0 ? 'failed' : 'passed');
    const snap = snapshotErrors();
    onProgress({
      type: 'load.finished',
      phase,
      completedOps,
      totalOps,
      successCount,
      failCount,
      ...snap,
      summary,
    });
    return summary;
  } catch (err) {
    phase = 'cleanup';
    await cleanupUsers({ userIds, emailPrefixes: ['loadtest+'] });
    const summary = buildSummary(timedOut ? 'timeout' : 'failed');
    const message = err instanceof Error ? err.message : String(err);
    const snap = snapshotErrors();
    onProgress({
      type: 'load.error',
      phase: 'done',
      completedOps,
      totalOps,
      successCount,
      failCount,
      ...snap,
      summary,
      error: sanitizeMessage(message),
    });
    return summary;
  }
}

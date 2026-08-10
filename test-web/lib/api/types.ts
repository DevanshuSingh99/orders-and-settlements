/** Suite catalogue returned by GET /test/suites. */
export interface ScenarioInfo {
  id: string;
  title: string;
  rule: string;
}

export interface SuiteInfo {
  id: string;
  title: string;
  description: string;
  scenarios: ScenarioInfo[];
}

export interface LoginResponse {
  data: { accessToken: string };
}

/** Wire shape from the runner — suites are nested under data.suites. */
export interface SuitesResponse {
  data: { suites: SuiteInfo[] };
}

export interface CreateRunResponse {
  data: { runId: string };
}

export type StepStatus = "pending" | "running" | "passed" | "failed" | "skipped";
export type ScenarioStatus = StepStatus;
export type RunStatus = "idle" | "connecting" | "running" | "passed" | "failed" | "error";

export interface AssertionResult {
  path: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export interface ParallelSummary {
  successCount: number;
  failureCount: number;
  expectedSuccess: number;
  expectedFailure: number;
}

export interface StepResult {
  name: string;
  status: "passed" | "failed";
  durationMs: number;
  kind?: "http" | "parallel";
  /** Concurrent race attempt vs post-race follow-up (parallel children only). */
  phase?: "concurrent" | "after";
  request?: {
    method: string;
    path: string;
    body?: unknown;
    headers?: Record<string, string>;
  };
  response?: {
    status: number;
    body?: unknown;
  };
  assertions?: AssertionResult[];
  error?: string;
  children?: StepResult[];
  parallelSummary?: ParallelSummary;
}

export interface RunSummary {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  elapsedMs: number;
  apiBaseUrl?: string;
}

/** Snapshot of a suite run as stored by the test-runner (from `run.snapshot`). */
export interface SuiteRunSnapshot {
  id: string;
  kind?: "suite" | "load";
  status?: "queued" | "running" | "finished" | "failed";
  suites?: string[];
  scenarios?: Array<{
    id: string;
    suite: string;
    title: string;
    rule: string;
    passed: boolean;
    durationMs: number;
    steps: StepResult[];
    error?: string;
  }>;
  summary?: {
    total: number;
    passed: number;
    failed: number;
    skipped?: number;
    durationMs?: number;
    elapsedMs?: number;
    apiBaseUrl?: string;
  };
  error?: string;
}

/** SSE payloads from GET /test/runs/:id/stream */
export type SuiteStreamEvent =
  | { type: "run.snapshot"; run: SuiteRunSnapshot }
  | { type: "run.started"; runId: string; suites?: string[]; startedAt?: string; apiBaseUrl?: string }
  | { type: "scenario.started"; suiteId: string; scenarioId: string; title?: string; rule?: string }
  | {
      type: "step.started";
      suiteId: string;
      scenarioId: string;
      stepName: string;
      stepIndex: number;
    }
  | {
      type: "step.finished";
      suiteId: string;
      scenarioId: string;
      stepIndex: number;
      step: StepResult;
    }
  | {
      type: "scenario.finished";
      suiteId: string;
      scenarioId: string;
      status: "passed" | "failed" | "skipped";
      durationMs: number;
      /** Full step results including parallel children (when sent by the runner). */
      steps?: StepResult[];
    }
  | { type: "run.finished"; status: "passed" | "failed"; summary: RunSummary }
  | { type: "run.error"; message: string };

/** Hard caps from GET /test/load/limits → data.limits */
export interface LoadLimits {
  maxUsers: number;
  maxOrders: number;
  maxPayments: number;
  maxConcurrency: number;
  maxBurstParallel: number;
  maxTotalOps: number;
  maxTimeoutMs: number;
  minThinkTimeMs: number;
  maxThinkTimeMs: number;
}

/** Nested load profile matching the test-runner schema. */
export interface LoadProfile {
  name: string;
  users: number;
  concurrency: number;
  thinkTimeMs: number;
  orders: {
    count: number;
    total: number;
    dueInDays: number;
  };
  payments: {
    partialFraction: number;
    payRemainingOnHalf: boolean;
  };
  burst: {
    enabled: boolean;
    amount: number;
    parallel: number;
  };
}

export type LoadPresetId = "smoke" | "baseline" | "stress";

export interface LoadLimitsResponse {
  data: {
    limits: LoadLimits;
    presets: Record<LoadPresetId, LoadProfile>;
  };
}

export interface CreateLoadRunResponse {
  data: {
    runId: string;
    status?: string;
    totalOps?: number;
    estimates?: { payments: number; burstOps: number; totalOps: number };
  };
}

export interface HistogramBucket {
  /** Inclusive upper bound in ms; -1 = above the previous bound (+Inf). */
  le: number;
  count: number;
}

export type LoadOperation =
  | "register"
  | "create_order"
  | "partial_payment"
  | "pay_remaining"
  | "burst_order"
  | "burst_payment";

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

export interface LoadSummary {
  status?: "passed" | "failed" | "timeout";
  totalRequests: number;
  successCount: number;
  errorCount: number;
  elapsedMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms?: number;
  avgMs?: number;
  histogram: HistogramBucket[];
  statusHistogram?: Record<string, number>;
  topErrors: LoadErrorGroup[];
  byOperation: LoadOperationStats[];
  recentErrors: LoadErrorSample[];
  rps?: number;
}

export type LoadRunStatus = "idle" | "connecting" | "running" | "finished" | "error";

/** Snapshot of a load run (from `run.snapshot` on the load stream). */
export interface LoadRunSnapshot {
  id: string;
  kind?: "suite" | "load";
  status?: "queued" | "running" | "finished" | "failed";
  completedOps?: number;
  totalOps?: number;
  phase?: string;
  recentErrors?: LoadErrorSample[];
  summary?: LoadSummary;
  error?: string;
  profile?: LoadProfile;
}

export type LoadStreamEvent =
  | { type: "run.snapshot"; run: LoadRunSnapshot }
  | { type: "load.started"; runId: string; config?: LoadProfile }
  | {
      type: "load.progress";
      completed: number;
      total: number;
      errors: number;
      successCount?: number;
      phase?: string;
      rps?: number;
      statusHistogram?: Record<string, number>;
      recentErrors?: LoadErrorSample[];
      topErrors?: LoadErrorGroup[];
      byOperation?: LoadOperationStats[];
    }
  | { type: "load.finished"; summary: LoadSummary }
  | { type: "load.error"; message: string; summary?: LoadSummary };

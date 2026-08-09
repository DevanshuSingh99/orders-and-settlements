"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { testApi } from "@/lib/api/testApi";
import type {
  LoadErrorGroup,
  LoadErrorSample,
  LoadLimits,
  LoadOperation,
  LoadOperationStats,
  LoadPresetId,
  LoadProfile,
  LoadRunStatus,
  LoadStreamEvent,
  LoadSummary,
} from "@/lib/api/types";
import {
  LOAD_PRESET_META,
  clampLoadProfile,
  estimateTotalOps,
  profileValidationErrors,
  resolvePreset,
} from "@/lib/loadPresets";
import { openSseStream } from "@/lib/sse";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/PageState";
import { StatusBadge } from "@/components/suites/StatusBadge";
import { InfoTip } from "@/components/ui/InfoTip";

const OPERATION_LABELS: Record<LoadOperation, string> = {
  register: "Register user",
  create_order: "Create order",
  partial_payment: "Partial payment",
  pay_remaining: "Pay remaining",
  burst_order: "Burst order",
  burst_payment: "Burst payment",
};

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatBucketLabel(le: number, prevLe: number | null): string {
  // Backend uses -1 (and legacy null/Infinity) for the open-ended bucket.
  if (le < 0 || !Number.isFinite(le)) {
    return prevLe !== null && prevLe > 0 ? `>${prevLe}ms` : ">max";
  }
  return `≤${le}ms`;
}

function parseNumber(raw: string, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function Histogram({ buckets }: { buckets: LoadSummary["histogram"] }) {
  if (!buckets.length) {
    return <p className="text-xs text-zinc-500">No histogram data.</p>;
  }
  const max = Math.max(...buckets.map((b) => b.count), 1);
  return (
    <div className="space-y-1.5">
      {buckets.map((bucket, index) => {
        const prevLe = index > 0 ? buckets[index - 1]!.le : null;
        return (
          <div key={`hist-${bucket.le}-${index}`} className="flex items-center gap-3 text-xs">
            <span className="w-20 shrink-0 text-right font-mono text-zinc-500">
              {formatBucketLabel(bucket.le, prevLe)}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-100">
              <div className="h-full bg-zinc-700" style={{ width: `${(bucket.count / max) * 100}%` }} />
            </div>
            <span className="w-10 shrink-0 font-mono text-zinc-600">{bucket.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function StatusCodeBars({ histogram }: { histogram: Record<string, number> }) {
  const entries = Object.entries(histogram)
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || Number(a.status) - Number(b.status));
  if (entries.length === 0) {
    return <p className="text-xs text-zinc-500">No status codes recorded.</p>;
  }
  const max = Math.max(...entries.map((e) => e.count), 1);
  return (
    <div className="space-y-1.5">
      {entries.map((entry) => {
        const code = Number(entry.status);
        const tone =
          code >= 500 ? "bg-red-600" : code >= 400 ? "bg-amber-500" : code >= 200 && code < 300 ? "bg-emerald-600" : "bg-zinc-500";
        return (
          <div key={`status-${entry.status}`} className="flex items-center gap-3 text-xs">
            <span className="w-12 shrink-0 text-right font-mono text-zinc-600">{entry.status}</span>
            <div className="h-2 flex-1 overflow-hidden rounded bg-zinc-100">
              <div className={`h-full ${tone}`} style={{ width: `${(entry.count / max) * 100}%` }} />
            </div>
            <span className="w-10 shrink-0 font-mono text-zinc-600">{entry.count}</span>
          </div>
        );
      })}
    </div>
  );
}

function OperationTable({ rows }: { rows: LoadOperationStats[] }) {
  if (rows.length === 0) {
    return <p className="text-xs text-zinc-500">No per-operation stats yet.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[280px] text-left text-xs">
        <thead>
          <tr className="border-b border-zinc-100 text-zinc-500">
            <th className="py-1.5 pr-3 font-medium">Operation</th>
            <th className="py-1.5 pr-3 font-medium">OK</th>
            <th className="py-1.5 font-medium">Fail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.operation} className="border-b border-zinc-50 last:border-0">
              <td className="py-1.5 pr-3 text-zinc-800">
                {OPERATION_LABELS[row.operation] ?? row.operation}
              </td>
              <td className="py-1.5 pr-3 font-mono text-emerald-700">{row.success}</td>
              <td className={`py-1.5 font-mono ${row.fail > 0 ? "text-red-700" : "text-zinc-500"}`}>
                {row.fail}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorBreakdown({
  topErrors,
  recentErrors,
}: {
  topErrors: LoadErrorGroup[];
  recentErrors: LoadErrorSample[];
}) {
  if (topErrors.length === 0 && recentErrors.length === 0) {
    return <p className="text-xs text-zinc-500">No errors recorded.</p>;
  }
  return (
    <div className="space-y-3">
      {topErrors.length > 0 ? (
        <ul className="space-y-2">
          {topErrors.map((err, index) => (
            <li
              key={`top-err-${err.status}-${err.operation}-${index}`}
              className="rounded border border-red-100 bg-red-50/40 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-white px-1.5 py-0.5 font-mono text-red-700 ring-1 ring-red-100">
                  {err.status}
                </span>
                <span className="font-medium text-zinc-800">
                  {OPERATION_LABELS[err.operation] ?? err.operation}
                </span>
                <span className="ml-auto font-mono text-zinc-500">×{err.count}</span>
              </div>
              <p className="mt-1 break-words font-mono text-[11px] text-zinc-600">{err.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {recentErrors.length > 0 && topErrors.length === 0 ? (
        <ul className="space-y-2">
          {recentErrors.map((err, index) => (
            <li
              key={`recent-err-${err.status}-${err.operation}-${index}`}
              className="rounded border border-zinc-200 bg-zinc-50/60 px-3 py-2"
            >
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-red-700">{err.status}</span>
                <span className="text-zinc-700">{OPERATION_LABELS[err.operation] ?? err.operation}</span>
              </div>
              <p className="mt-1 break-words font-mono text-[11px] text-zinc-600">{err.message}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

type RawLoadSummary = LoadSummary & {
  failCount?: number;
  completedOps?: number;
  durationMs?: number;
  latencyMs?: { p50?: number; p95?: number; p99?: number; avg?: number };
  latencyHistogram?: LoadSummary["histogram"];
  statusHistogram?: Record<string, number>;
};

function normalizeSummary(s: RawLoadSummary): LoadSummary {
  const histogram = Array.isArray(s.histogram)
    ? s.histogram
    : Array.isArray(s.latencyHistogram)
      ? s.latencyHistogram
      : [];
  const elapsedMs = s.elapsedMs ?? s.durationMs ?? 0;
  const totalRequests = s.totalRequests ?? s.completedOps ?? 0;
  const rps =
    s.rps ??
    (elapsedMs > 0 && totalRequests > 0 ? Math.round((totalRequests / (elapsedMs / 1000)) * 10) / 10 : undefined);

  return {
    status: s.status,
    totalRequests,
    successCount: s.successCount ?? 0,
    errorCount: s.errorCount ?? s.failCount ?? 0,
    elapsedMs,
    p50Ms: s.p50Ms ?? s.latencyMs?.p50 ?? 0,
    p95Ms: s.p95Ms ?? s.latencyMs?.p95 ?? 0,
    p99Ms: s.p99Ms ?? s.latencyMs?.p99,
    avgMs: s.avgMs ?? s.latencyMs?.avg,
    histogram,
    statusHistogram: s.statusHistogram ?? {},
    topErrors: Array.isArray(s.topErrors) ? s.topErrors : [],
    byOperation: Array.isArray(s.byOperation) ? s.byOperation : [],
    recentErrors: Array.isArray(s.recentErrors) ? s.recentErrors : [],
    rps,
  };
}

/** Normalize runner load SSE payloads (completedOps/totalOps/error) to UI fields. */
function normalizeLoadEvent(event: LoadStreamEvent): LoadStreamEvent {
  const raw = event as LoadStreamEvent & {
    completedOps?: number;
    totalOps?: number;
    failCount?: number;
    successCount?: number;
    recentErrors?: LoadErrorSample[];
    topErrors?: LoadErrorGroup[];
    byOperation?: LoadOperationStats[];
    statusHistogram?: Record<string, number>;
    phase?: string;
    error?: string;
    summary?: RawLoadSummary;
  };

  if (raw.type === "load.progress") {
    return {
      type: "load.progress",
      completed: raw.completed ?? raw.completedOps ?? 0,
      total: raw.total ?? raw.totalOps ?? 0,
      errors: raw.errors ?? raw.failCount ?? 0,
      successCount: raw.successCount,
      phase: raw.phase,
      rps: raw.rps,
      statusHistogram: raw.statusHistogram,
      recentErrors: raw.recentErrors,
      topErrors: raw.topErrors,
      byOperation: raw.byOperation,
    };
  }

  if (raw.type === "load.error") {
    return {
      type: "load.error",
      message: raw.message ?? raw.error ?? "Load run failed.",
      summary: raw.summary ? normalizeSummary(raw.summary) : undefined,
    };
  }

  if (raw.type === "load.finished" && raw.summary) {
    return {
      type: "load.finished",
      summary: normalizeSummary(raw.summary),
    };
  }

  return event;
}

function FieldLabel({
  title,
  tipTitle,
  tip,
  cap,
}: {
  title: string;
  tipTitle: string;
  tip: React.ReactNode;
  cap?: string;
}) {
  return (
    <div className="mb-1 flex items-center gap-1.5">
      <Label className="mb-0">{title}</Label>
      <InfoTip label={tipTitle}>{tip}</InfoTip>
      {cap ? <span className="ml-auto text-[11px] text-zinc-400">{cap}</span> : null}
    </div>
  );
}

export function LoadTab() {
  const { accessToken } = useAuth();
  const [limits, setLimits] = useState<LoadLimits | null>(null);
  const [serverPresets, setServerPresets] = useState<Record<LoadPresetId, LoadProfile> | undefined>();
  const [profile, setProfile] = useState<LoadProfile | null>(null);
  const [activePreset, setActivePreset] = useState<LoadPresetId | null>("smoke");
  const [loadError, setLoadError] = useState<FormattedApiError | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const [runStatus, setRunStatus] = useState<LoadRunStatus>("idle");
  const [progress, setProgress] = useState<{
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
  } | null>(null);
  const [summary, setSummary] = useState<LoadSummary | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const closeStreamRef = useRef<(() => void) | null>(null);

  const loadLimits = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await testApi.getLoadLimits(accessToken);
      if (!res?.data?.limits) {
        setLoadError("Unexpected response from the test-runner (missing load limits).");
        setLimits(null);
        setProfile(null);
        return;
      }
      const nextLimits = res.data.limits;
      const nextPresets = res.data.presets;
      setLimits(nextLimits);
      setServerPresets(nextPresets);
      setProfile(resolvePreset("smoke", nextLimits, nextPresets));
      setActivePreset("smoke");
    } catch (err) {
      setLoadError(formatApiError(err, "Unable to load limits."));
      setLimits(null);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLimits();
  }, [loadLimits]);

  useEffect(() => {
    return () => {
      closeStreamRef.current?.();
    };
  }, []);

  function patchProfile(updater: (prev: LoadProfile) => LoadProfile) {
    if (!limits || !profile) return;
    setActivePreset(null);
    setProfile(clampLoadProfile(updater(profile), limits));
  }

  function applyPreset(id: LoadPresetId) {
    if (!limits) return;
    setActivePreset(id);
    setProfile(resolvePreset(id, limits, serverPresets));
    setRunError(null);
  }

  function startStream(runId: string) {
    if (!accessToken) return;
    closeStreamRef.current?.();
    setRunStatus("connecting");

    closeStreamRef.current = openSseStream<LoadStreamEvent>(
      `/test/load/runs/${encodeURIComponent(runId)}/stream`,
      accessToken,
      {
        onOpen: () => setRunStatus("running"),
        onEvent: (event) => {
          if (event.type === "run.snapshot") {
            const run = event.run;
            if (run.kind === "suite") return;
            if (typeof run.completedOps === "number" || typeof run.totalOps === "number") {
              setProgress({
                completed: run.completedOps ?? 0,
                total: run.totalOps ?? 0,
                errors: run.summary?.errorCount ?? 0,
                phase: run.phase,
                recentErrors: run.recentErrors,
              });
            }
            if (run.summary) {
              setSummary(normalizeSummary(run.summary as RawLoadSummary));
            }
            if (run.error && (run.status === "failed" || !run.summary)) {
              setRunError(run.error);
              setRunStatus("error");
              closeStreamRef.current?.();
              closeStreamRef.current = null;
              return;
            }
            if (run.status === "finished" || run.status === "failed") {
              setRunStatus(run.status === "failed" ? "error" : "finished");
              closeStreamRef.current?.();
              closeStreamRef.current = null;
            } else {
              setRunStatus("running");
            }
            return;
          }

          const normalized = normalizeLoadEvent(event);
          if (normalized.type === "load.progress") {
            setProgress({
              completed: normalized.completed,
              total: normalized.total,
              errors: normalized.errors,
              successCount: normalized.successCount,
              phase: normalized.phase,
              rps: normalized.rps,
              statusHistogram: normalized.statusHistogram,
              recentErrors: normalized.recentErrors,
              topErrors: normalized.topErrors,
              byOperation: normalized.byOperation,
            });
            setRunStatus("running");
            return;
          }
          if (normalized.type === "load.finished") {
            setSummary(normalized.summary);
            setRunStatus("finished");
            closeStreamRef.current?.();
            closeStreamRef.current = null;
            return;
          }
          if (normalized.type === "load.error") {
            setRunError(normalized.message || "Load run failed.");
            if (normalized.summary) setSummary(normalized.summary);
            setRunStatus("error");
            closeStreamRef.current?.();
            closeStreamRef.current = null;
          }
        },
        onError: (message) => {
          setRunError(message);
          setRunStatus("error");
          closeStreamRef.current = null;
        },
      },
    );
  }

  async function startLoad() {
    if (!accessToken || !limits || !profile) return;
    const clamped = clampLoadProfile(profile, limits);
    const errors = profileValidationErrors(clamped, limits);
    if (errors.length > 0) {
      setRunError(errors.join(" "));
      setRunStatus("error");
      return;
    }

    setProfile(clamped);
    setIsStarting(true);
    setRunError(null);
    setSummary(null);
    setProgress(null);
    setRunStatus("connecting");

    try {
      const res = await testApi.createLoadRun(accessToken, clamped);
      startStream(res.data.runId);
    } catch (err) {
      const formatted = formatApiError(err, "Failed to start load run.");
      setRunError(formatted.hint ? `${formatted.summary} ${formatted.hint}` : formatted.summary);
      setRunStatus("error");
    } finally {
      setIsStarting(false);
    }
  }

  const isBusy = isStarting || runStatus === "connecting" || runStatus === "running";

  if (isLoading) return <LoadingState label="Loading load limits..." />;
  if (loadError) {
    const msg = typeof loadError === "string" ? loadError : loadError.message;
    const hint = typeof loadError === "string" ? undefined : loadError.hint;
    return <ErrorState message={msg} hint={hint} onRetry={loadLimits} />;
  }
  if (!limits || !profile) {
    return <EmptyState title="No load limits" description="The test-runner did not return limits." />;
  }

  const estimatedOps = estimateTotalOps(profile);
  const clientErrors = profileValidationErrors(profile, limits);
  const pct =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.completed / progress.total) * 100)) : 0;

  const liveTopErrors = summary?.topErrors?.length ? summary.topErrors : (progress?.topErrors ?? []);
  const liveRecentErrors = summary?.recentErrors?.length
    ? summary.recentErrors
    : (progress?.recentErrors ?? []);
  const liveByOperation = summary?.byOperation?.length
    ? summary.byOperation
    : (progress?.byOperation ?? []);
  const showResults = Boolean(summary) || (progress && (progress.errors > 0 || liveByOperation.length > 0));

  const outcomeTone =
    runStatus === "error" || (summary && summary.errorCount > 0)
      ? "border-red-200 bg-red-50/40"
      : runStatus === "finished"
        ? "border-emerald-200 bg-emerald-50/40"
        : "border-zinc-200 bg-white";

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Hard caps</h2>
          <InfoTip label="Why these caps exist">
            Load runs on the API host (not in your browser). Caps protect a small VM (~1 OCPU / 6 GB)
            from being overwhelmed. Values above these limits are rejected by the server.
          </InfoTip>
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-5">
          <div>
            <dt className="text-xs text-zinc-500">Max users</dt>
            <dd className="font-medium text-zinc-900">{limits.maxUsers}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Max orders</dt>
            <dd className="font-medium text-zinc-900">{limits.maxOrders.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Max payments</dt>
            <dd className="font-medium text-zinc-900">{limits.maxPayments.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Max concurrency</dt>
            <dd className="font-medium text-zinc-900">{limits.maxConcurrency}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Max total HTTP ops</dt>
            <dd className="font-medium text-zinc-900">{limits.maxTotalOps.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Think time</dt>
            <dd className="font-medium text-zinc-900">
              {limits.minThinkTimeMs}–{limits.maxThinkTimeMs}ms
            </dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Burst parallel</dt>
            <dd className="font-medium text-zinc-900">≤ {limits.maxBurstParallel}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Timeout</dt>
            <dd className="font-medium text-zinc-900">{Math.round(limits.maxTimeoutMs / 60000)} min</dd>
          </div>
        </dl>
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-zinc-900">Presets</h2>
          <InfoTip label="Using presets">
            Click a preset to fill safe defaults. You can still tweak fields afterward. Prefer{" "}
            <strong>Smoke</strong> first, then <strong>Baseline</strong>. Use <strong>Stress</strong> only when
            you intentionally want near-cap load.
          </InfoTip>
        </div>
        <div className="flex flex-wrap gap-2">
          {LOAD_PRESET_META.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              size="sm"
              variant={activePreset === preset.id ? "primary" : "outline"}
              onPress={() => applyPreset(preset.id)}
              isDisabled={isBusy}
            >
              {preset.label}
            </Button>
          ))}
        </div>
        {activePreset ? (
          <p className="text-xs text-zinc-500">
            {LOAD_PRESET_META.find((p) => p.id === activePreset)?.description}
          </p>
        ) : (
          <p className="text-xs text-zinc-500">Custom configuration (clamped to hard caps on change).</p>
        )}
      </section>

      <form
        className="grid gap-4 rounded-lg border border-zinc-200 bg-white px-4 py-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          void startLoad();
        }}
      >
        <TextField
          type="number"
          value={String(profile.users)}
          isDisabled={isBusy}
          onChange={(v) =>
            patchProfile((p) => ({ ...p, users: parseNumber(v, p.users) }))
          }
        >
          <FieldLabel
            title="Users"
            tipTitle="Users"
            cap={`1–${limits.maxUsers}`}
            tip="How many throwaway accounts to register for the load run. Keep this low — each user creates orders and payments."
          />
          <Input min={1} max={limits.maxUsers} step={1} />
        </TextField>

        <TextField
          type="number"
          value={String(profile.orders.count)}
          isDisabled={isBusy}
          onChange={(v) =>
            patchProfile((p) => ({
              ...p,
              orders: { ...p.orders, count: parseNumber(v, p.orders.count) },
            }))
          }
        >
          <FieldLabel
            title="Orders"
            tipTitle="Orders"
            cap={`1–${limits.maxOrders}`}
            tip="Total orders to create across users. This is usually the largest cost on the database. Start at 20 (Smoke) or 200 (Baseline)."
          />
          <Input min={1} max={limits.maxOrders} step={1} />
        </TextField>

        <TextField
          type="number"
          value={String(profile.concurrency)}
          isDisabled={isBusy}
          onChange={(v) =>
            patchProfile((p) => ({ ...p, concurrency: parseNumber(v, p.concurrency) }))
          }
        >
          <FieldLabel
            title="Concurrency"
            tipTitle="Concurrency"
            cap={`1–${limits.maxConcurrency}`}
            tip="How many HTTP requests run in flight at once on the server. Higher values stress CPU/DB harder. On 1 OCPU, stay at 8 or below for Baseline."
          />
          <Input min={1} max={limits.maxConcurrency} step={1} />
        </TextField>

        <TextField
          type="number"
          value={String(profile.thinkTimeMs)}
          isDisabled={isBusy}
          onChange={(v) =>
            patchProfile((p) => ({ ...p, thinkTimeMs: parseNumber(v, p.thinkTimeMs) }))
          }
        >
          <FieldLabel
            title="Think time (ms)"
            tipTitle="Think time"
            cap={`${limits.minThinkTimeMs}–${limits.maxThinkTimeMs}ms`}
            tip="Pause between batches of requests. Adds pacing so the small VM is not hit with a thundering herd. 50ms is a good default."
          />
          <Input min={limits.minThinkTimeMs} max={limits.maxThinkTimeMs} step={10} />
        </TextField>

        <TextField
          type="number"
          value={String(profile.orders.total)}
          isDisabled={isBusy}
          onChange={(v) =>
            patchProfile((p) => ({
              ...p,
              orders: { ...p.orders, total: parseNumber(v, p.orders.total) },
            }))
          }
        >
          <FieldLabel
            title="Order total ($)"
            tipTitle="Order total"
            tip="Dollar amount for each generated order (single line item). Used when recording partial/full payments."
          />
          {/* step=any avoids HTML5 invalid state when min is 0.01 and value is a whole dollar. */}
          <Input min={0.01} step="any" />
        </TextField>

        <TextField
          type="number"
          value={String(Math.round(profile.payments.partialFraction * 100))}
          isDisabled={isBusy}
          onChange={(v) =>
            patchProfile((p) => ({
              ...p,
              payments: {
                ...p.payments,
                partialFraction: parseNumber(v, p.payments.partialFraction * 100) / 100,
              },
            }))
          }
        >
          <FieldLabel
            title="Partial payment %"
            tipTitle="Partial payment fraction"
            tip="Percentage of orders that receive a partial payment first. Example: 40 means 40% of orders get a partial pay; half of those may also get a “pay remaining” call."
          />
          <Input min={0} max={100} step={5} />
        </TextField>

        <label className="flex items-start gap-2 text-sm text-zinc-700 sm:col-span-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 rounded border-zinc-300"
            checked={profile.burst.enabled}
            disabled={isBusy}
            onChange={(e) =>
              patchProfile((p) => ({
                ...p,
                burst: { ...p.burst, enabled: e.target.checked },
              }))
            }
          />
          <span className="flex-1">
            <span className="inline-flex items-center gap-1.5 font-medium">
              Concurrent overpay burst
              <InfoTip label="Burst mode">
                Fires several payment requests at once against one order (race). Used to exercise the guarded
                UPDATE. Parallelism is capped at {limits.maxBurstParallel}.
              </InfoTip>
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Parallel requests: {profile.burst.parallel} · amount ${profile.burst.amount}
            </span>
          </span>
        </label>

        {profile.burst.enabled ? (
          <>
            <TextField
              type="number"
              value={String(profile.burst.parallel)}
              isDisabled={isBusy}
              onChange={(v) =>
                patchProfile((p) => ({
                  ...p,
                  burst: { ...p.burst, parallel: parseNumber(v, p.burst.parallel) },
                }))
              }
            >
              <FieldLabel
                title="Burst parallel"
                tipTitle="Burst parallel"
                cap={`1–${limits.maxBurstParallel}`}
                tip="How many concurrent payment attempts in the race. 2 is enough to demonstrate the concurrency guard."
              />
              <Input min={1} max={limits.maxBurstParallel} step={1} />
            </TextField>
            <TextField
              type="number"
              value={String(profile.burst.amount)}
              isDisabled={isBusy}
              onChange={(v) =>
                patchProfile((p) => ({
                  ...p,
                  burst: { ...p.burst, amount: parseNumber(v, p.burst.amount) },
                }))
              }
            >
              <FieldLabel
                title="Burst amount ($)"
                tipTitle="Burst amount"
                tip="Each parallel payment uses this dollar amount. For a race, pick an amount that would overpay if both succeeded."
              />
              <Input min={0.01} step="any" />
            </TextField>
          </>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-4 sm:col-span-2">
          <p className="text-xs text-zinc-500">
            Estimated HTTP ops:{" "}
            <span className={estimatedOps > limits.maxTotalOps ? "font-medium text-red-600" : "font-medium text-zinc-800"}>
              {estimatedOps.toLocaleString()}
            </span>{" "}
            / {limits.maxTotalOps.toLocaleString()} max
          </p>
          <Button type="submit" isPending={isStarting} isDisabled={isBusy || clientErrors.length > 0}>
            Start load
          </Button>
        </div>

        {clientErrors.length > 0 ? (
          <ul className="space-y-1 text-xs text-red-600 sm:col-span-2">
            {clientErrors.map((err, index) => (
              <li key={`load-err-${index}-${err}`}>{err}</li>
            ))}
          </ul>
        ) : null}
      </form>

      {(runStatus !== "idle" || runError) && (
        <section className={`space-y-4 rounded-lg border px-4 py-4 ${outcomeTone}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-zinc-900">
                  {summary
                    ? summary.errorCount > 0
                      ? `Finished with ${summary.errorCount} error${summary.errorCount === 1 ? "" : "s"}`
                      : "Finished cleanly"
                    : runStatus === "error"
                      ? "Load run error"
                      : runStatus === "connecting"
                        ? "Starting load…"
                        : "Load in progress…"}
                </h3>
                <StatusBadge status={runStatus} />
              </div>
              <p className="mt-1 text-sm text-zinc-600">
                {progress ? (
                  <>
                    {progress.completed}/{progress.total} ops ({pct}%)
                    {progress.phase ? (
                      <span className="text-zinc-500"> · phase {progress.phase}</span>
                    ) : null}
                    {progress.errors > 0 ? (
                      <span className="text-red-600"> · {progress.errors} errors</span>
                    ) : null}
                    {progress.rps !== undefined ? (
                      <span className="text-zinc-500"> · {progress.rps.toFixed(1)} rps</span>
                    ) : null}
                  </>
                ) : runStatus === "connecting" ? (
                  "Connecting to the live stream."
                ) : (
                  "Waiting for progress…"
                )}
              </p>
            </div>
          </div>

          {progress && progress.total > 0 ? (
            <div className="h-2 overflow-hidden rounded bg-zinc-100">
              <div className="h-full bg-zinc-800 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          ) : null}

          {runError ? <p className="text-sm text-red-700">{runError}</p> : null}

          {summary ? (
            <dl className="grid grid-cols-2 gap-3 border-t border-zinc-200/70 pt-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-zinc-500">Requests</dt>
                <dd className="font-medium text-zinc-900">{summary.totalRequests}</dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Success / errors</dt>
                <dd className="font-medium text-zinc-900">
                  <span className="text-emerald-700">{summary.successCount}</span>
                  {" / "}
                  <span className={summary.errorCount > 0 ? "text-red-700" : "text-zinc-700"}>
                    {summary.errorCount}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">p50 / p95 / p99</dt>
                <dd className="font-medium text-zinc-900">
                  {formatMs(summary.p50Ms)} / {formatMs(summary.p95Ms)}
                  {summary.p99Ms !== undefined ? ` / ${formatMs(summary.p99Ms)}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Elapsed{summary.rps !== undefined ? " · rps" : ""}</dt>
                <dd className="font-medium text-zinc-900">
                  {formatMs(summary.elapsedMs)}
                  {summary.rps !== undefined ? (
                    <span className="text-zinc-500"> · {summary.rps}</span>
                  ) : null}
                </dd>
              </div>
            </dl>
          ) : null}

          {showResults ? (
            <div className="grid gap-4 border-t border-zinc-200/70 pt-4 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  By operation
                </h4>
                <OperationTable rows={liveByOperation} />
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  HTTP status codes
                </h4>
                <StatusCodeBars
                  histogram={summary?.statusHistogram ?? progress?.statusHistogram ?? {}}
                />
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  Latency histogram
                </h4>
                <Histogram buckets={summary?.histogram ?? []} />
                {summary?.avgMs !== undefined ? (
                  <p className="mt-2 text-[11px] text-zinc-500">Average {formatMs(summary.avgMs)}</p>
                ) : null}
              </div>
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                  What failed
                </h4>
                <ErrorBreakdown topErrors={liveTopErrors} recentErrors={liveRecentErrors} />
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

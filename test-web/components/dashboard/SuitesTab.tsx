"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@heroui/react";
import { useAuth } from "@/lib/auth/AuthContext";
import { formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { testApi } from "@/lib/api/testApi";
import type {
  RunStatus,
  RunSummary,
  StepResult,
  SuiteInfo,
  SuiteRunSnapshot,
  SuiteStreamEvent,
} from "@/lib/api/types";
import { openSseStream } from "@/lib/sse";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/PageState";
import {
  RunResults,
  type LiveScenario,
  type LiveSuite,
  type LiveStep,
} from "@/components/suites/RunResults";

function ensureSuite(map: Map<string, LiveSuite>, suiteId: string, catalogue: SuiteInfo[]): LiveSuite {
  let suite = map.get(suiteId);
  if (!suite) {
    const info = catalogue.find((s) => s.id === suiteId);
    suite = {
      id: suiteId,
      title: info?.title ?? suiteId,
      scenarios: [],
    };
    map.set(suiteId, suite);
  }
  return suite;
}

function ensureScenario(
  suite: LiveSuite,
  scenarioId: string,
  catalogue: SuiteInfo[],
  extras?: { title?: string; rule?: string },
): LiveScenario {
  let scenario = suite.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) {
    const info = catalogue
      .find((s) => s.id === suite.id)
      ?.scenarios.find((sc) => sc.id === scenarioId);
    scenario = {
      id: scenarioId,
      title: extras?.title ?? info?.title ?? scenarioId,
      rule: extras?.rule ?? info?.rule ?? "",
      status: "pending",
      steps: [],
    };
    suite.scenarios.push(scenario);
  } else if (extras) {
    if (extras.title) scenario.title = extras.title;
    if (extras.rule) scenario.rule = extras.rule;
  }
  return scenario;
}

/** Normalize runner step payloads (`passed` vs `status`, nested parallel children). */
function normalizeWireStep(raw: StepResult & { passed?: boolean }): StepResult {
  const status =
    raw.status ?? (raw.passed === false ? "failed" : raw.passed === true ? "passed" : "failed");
  return {
    ...raw,
    status,
    children: raw.children?.map((child) =>
      normalizeWireStep(child as StepResult & { passed?: boolean }),
    ),
  };
}

function applyLiveSteps(scenario: LiveScenario, steps: StepResult[]) {
  scenario.steps = steps.map((raw, index) => {
    const wireStep = normalizeWireStep(raw as StepResult & { passed?: boolean });
    return {
      index,
      name: wireStep.name,
      status: wireStep.status,
      result: wireStep,
    };
  });
}

/** Normalize legacy/alternate SSE field names so live tree ids stay defined. */
function eventSuiteId(event: SuiteStreamEvent): string | undefined {
  const raw = event as {
    suiteId?: string;
    suite?: string;
  };
  const id = raw.suiteId ?? raw.suite;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

function eventScenarioId(event: SuiteStreamEvent): string | undefined {
  const raw = event as {
    scenarioId?: string;
    scenario?: { id?: string };
  };
  if (typeof raw.scenarioId === "string" && raw.scenarioId.length > 0) return raw.scenarioId;
  if (typeof raw.scenario?.id === "string" && raw.scenario.id.length > 0) return raw.scenario.id;
  return undefined;
}

function applyEvent(
  prev: LiveSuite[],
  event: SuiteStreamEvent,
  catalogue: SuiteInfo[],
): LiveSuite[] {
  const map = new Map(
    prev
      .filter((s) => typeof s.id === "string" && s.id.length > 0)
      .map((s) => [
        s.id,
        {
          ...s,
          scenarios: s.scenarios
            .filter((sc) => typeof sc.id === "string" && sc.id.length > 0)
            .map((sc) => ({ ...sc, steps: [...sc.steps] })),
        },
      ]),
  );

  switch (event.type) {
    case "run.started": {
      if (event.suites?.length) {
        for (const suiteId of event.suites) {
          if (suiteId) ensureSuite(map, suiteId, catalogue);
        }
      }
      break;
    }
    case "scenario.started": {
      const suiteId = eventSuiteId(event);
      const scenarioId = eventScenarioId(event);
      if (!suiteId || !scenarioId) break;
      const suite = ensureSuite(map, suiteId, catalogue);
      const scenario = ensureScenario(suite, scenarioId, catalogue, {
        title: event.title,
        rule: event.rule,
      });
      scenario.status = "running";
      break;
    }
    case "step.started": {
      const suiteId = eventSuiteId(event);
      const scenarioId = eventScenarioId(event);
      if (!suiteId || !scenarioId) break;
      const suite = ensureSuite(map, suiteId, catalogue);
      const scenario = ensureScenario(suite, scenarioId, catalogue);
      scenario.status = "running";
      const stepIndex = event.stepIndex ?? scenario.steps.length;
      const existing = scenario.steps.find((s) => s.index === stepIndex);
      if (existing) {
        existing.status = "running";
        existing.name = event.stepName;
      } else {
        const step: LiveStep = {
          index: stepIndex,
          name: event.stepName,
          status: "running",
        };
        scenario.steps.push(step);
        scenario.steps.sort((a, b) => a.index - b.index);
      }
      break;
    }
    case "step.finished": {
      const suiteId = eventSuiteId(event);
      const scenarioId = eventScenarioId(event);
      if (!suiteId || !scenarioId) break;
      const suite = ensureSuite(map, suiteId, catalogue);
      const scenario = ensureScenario(suite, scenarioId, catalogue);
      const stepIndex = event.stepIndex ?? scenario.steps.length;
      const wireStep = normalizeWireStep(event.step as StepResult & { passed?: boolean });
      const existing = scenario.steps.find((s) => s.index === stepIndex);
      if (existing) {
        existing.status = wireStep.status;
        existing.name = wireStep.name || existing.name;
        existing.result = wireStep;
      } else {
        scenario.steps.push({
          index: stepIndex,
          name: wireStep.name,
          status: wireStep.status,
          result: wireStep,
        });
        scenario.steps.sort((a, b) => a.index - b.index);
      }
      break;
    }
    case "scenario.finished": {
      const raw = event as SuiteStreamEvent & {
        scenario?: { id?: string; suite?: string; passed?: boolean; durationMs?: number };
        steps?: StepResult[];
      };
      const suiteId = eventSuiteId(event) ?? raw.scenario?.suite;
      const scenarioId = eventScenarioId(event);
      if (!suiteId || !scenarioId) break;
      const suite = ensureSuite(map, suiteId, catalogue);
      const scenario = ensureScenario(suite, scenarioId, catalogue);
      if (raw.scenario && typeof raw.scenario.passed === "boolean") {
        scenario.status = raw.scenario.passed ? "passed" : "failed";
        scenario.durationMs = raw.scenario.durationMs;
      } else {
        scenario.status = event.status;
        scenario.durationMs = event.durationMs;
      }
      // Prefer full step tree from scenario.finished (includes parallel children).
      if (Array.isArray(raw.steps) && raw.steps.length > 0) {
        applyLiveSteps(scenario, raw.steps);
      }
      break;
    }
    default:
      break;
  }

  return Array.from(map.values());
}

/** Hydrate the live tree from the runner's initial `run.snapshot` payload. */
function suitesFromSnapshot(run: SuiteRunSnapshot, catalogue: SuiteInfo[]): LiveSuite[] {
  if (!Array.isArray(run.scenarios) || run.scenarios.length === 0) {
    if (run.suites?.length) {
      return run.suites.map((suiteId) => {
        const info = catalogue.find((s) => s.id === suiteId);
        return {
          id: suiteId,
          title: info?.title ?? suiteId,
          scenarios: (info?.scenarios ?? []).map((sc) => ({
            id: sc.id,
            title: sc.title,
            rule: sc.rule,
            status: "pending" as const,
            steps: [],
          })),
        };
      });
    }
    return [];
  }

  const bySuite = new Map<string, LiveSuite>();
  for (const scenario of run.scenarios) {
    const suiteId = scenario.suite;
    let suite = bySuite.get(suiteId);
    if (!suite) {
      const info = catalogue.find((s) => s.id === suiteId);
      suite = { id: suiteId, title: info?.title ?? suiteId, scenarios: [] };
      bySuite.set(suiteId, suite);
    }
    suite.scenarios.push({
      id: scenario.id,
      title: scenario.title,
      rule: scenario.rule,
      status: scenario.passed ? "passed" : "failed",
      durationMs: scenario.durationMs,
      steps: (scenario.steps ?? []).map((step, index) => {
        const wireStep = normalizeWireStep(step as StepResult & { passed?: boolean });
        return {
          index,
          name: wireStep.name,
          status: wireStep.status,
          result: wireStep,
        };
      }),
    });
  }
  return Array.from(bySuite.values());
}

function SuiteCard({
  suite,
  checked,
  disabled,
  onToggle,
  onRun,
}: {
  suite: SuiteInfo;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
  onRun: () => void;
}) {
  const [casesOpen, setCasesOpen] = useState(false);
  const scenarioCount = suite.scenarios.length;

  return (
    <li className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 rounded border-zinc-300"
          checked={checked}
          onChange={onToggle}
          aria-label={`Select ${suite.title}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">{suite.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                {suite.description || "Business-rule checks for this area of the API."}
              </p>
            </div>
            <Button type="button" size="sm" variant="ghost" isDisabled={disabled} onPress={onRun}>
              Run suite
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600">
              {scenarioCount} {scenarioCount === 1 ? "scenario" : "scenarios"}
            </span>
            <button
              type="button"
              className="text-xs font-medium text-zinc-600 underline-offset-2 hover:text-zinc-900 hover:underline"
              onClick={() => setCasesOpen((v) => !v)}
              aria-expanded={casesOpen}
            >
              {casesOpen ? "Hide cases" : "What it covers"}
            </button>
          </div>

          {casesOpen ? (
            <ul className="mt-2 space-y-1.5 border-t border-zinc-100 pt-2">
              {suite.scenarios.map((sc, scIndex) => (
                <li key={`catalogue-${suite.id}-${sc.id}-${scIndex}`} className="text-xs text-zinc-600">
                  <span className="font-medium text-zinc-800">{sc.title}</span>
                  {sc.rule ? <span className="text-zinc-500"> — {sc.rule}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function SuitesTab() {
  const { accessToken } = useAuth();
  const [suites, setSuites] = useState<SuiteInfo[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<FormattedApiError | string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);

  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [liveSuites, setLiveSuites] = useState<LiveSuite[]>([]);
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const closeStreamRef = useRef<(() => void) | null>(null);
  const catalogueRef = useRef<SuiteInfo[]>([]);

  const loadSuites = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await testApi.listSuites(accessToken);
      // Runner returns { data: { suites: [...] } }.
      if (!res?.data || !Array.isArray(res.data.suites)) {
        setLoadError("Unexpected response from the test-runner (missing suites list).");
        setSuites(null);
        return;
      }
      const catalogue = res.data.suites;
      setSuites(catalogue);
      catalogueRef.current = catalogue;
      setSelected(new Set(catalogue.map((s) => s.id)));
    } catch (err) {
      setLoadError(formatApiError(err, "Unable to load suites."));
      setSuites(null);
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSuites();
  }, [loadSuites]);

  useEffect(() => {
    return () => {
      closeStreamRef.current?.();
    };
  }, []);

  function toggleSuite(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    if (!suites) return;
    setSelected(checked ? new Set(suites.map((s) => s.id)) : new Set());
  }

  function startStream(runId: string) {
    if (!accessToken) return;
    closeStreamRef.current?.();
    setRunStatus("connecting");

    closeStreamRef.current = openSseStream<SuiteStreamEvent>(
      `/test/runs/${encodeURIComponent(runId)}/stream`,
      accessToken,
      {
        onOpen: () => setRunStatus("running"),
        onEvent: (event) => {
          if (event.type === "run.snapshot") {
            const run = event.run;
            if (run.kind === "load") return;
            if (run.scenarios?.length || run.suites?.length) {
              setLiveSuites(suitesFromSnapshot(run, catalogueRef.current));
            }
            if (run.error && (run.status === "failed" || !run.summary)) {
              setRunError(run.error);
              setRunStatus("error");
              closeStreamRef.current?.();
              closeStreamRef.current = null;
              return;
            }
            if (run.summary) {
              setSummary({
                passed: run.summary.passed ?? 0,
                failed: run.summary.failed ?? 0,
                skipped: run.summary.skipped ?? 0,
                total: run.summary.total ?? 0,
                elapsedMs: run.summary.elapsedMs ?? run.summary.durationMs ?? 0,
                apiBaseUrl: run.summary.apiBaseUrl,
              });
            }
            if (run.status === "finished" || run.status === "failed") {
              setRunStatus(
                run.status === "failed" || (run.summary?.failed ?? 0) > 0 ? "failed" : "passed",
              );
              closeStreamRef.current?.();
              closeStreamRef.current = null;
            } else if (run.status === "running" || run.status === "queued") {
              setRunStatus("running");
            }
            return;
          }
          if (event.type === "run.finished") {
            const raw = event as SuiteStreamEvent & {
              summary?: RunSummary & { durationMs?: number };
              error?: string;
            };
            if (raw.error && !raw.summary) {
              setRunError(raw.error);
              setRunStatus("error");
            } else if (raw.summary) {
              setSummary({
                passed: raw.summary.passed ?? 0,
                failed: raw.summary.failed ?? 0,
                skipped: raw.summary.skipped ?? 0,
                total: raw.summary.total ?? 0,
                elapsedMs: raw.summary.elapsedMs ?? raw.summary.durationMs ?? 0,
                apiBaseUrl: raw.summary.apiBaseUrl,
              });
              setRunStatus(event.status ?? (raw.summary.failed > 0 ? "failed" : "passed"));
            }
            closeStreamRef.current?.();
            closeStreamRef.current = null;
            return;
          }
          if (event.type === "run.error") {
            setRunError(event.message || "The suite run failed.");
            setRunStatus("error");
            closeStreamRef.current?.();
            closeStreamRef.current = null;
            return;
          }
          if (event.type === "run.started" && event.apiBaseUrl) {
            setSummary((prev) => ({
              passed: prev?.passed ?? 0,
              failed: prev?.failed ?? 0,
              skipped: prev?.skipped ?? 0,
              total: prev?.total ?? 0,
              elapsedMs: prev?.elapsedMs ?? 0,
              apiBaseUrl: event.apiBaseUrl,
            }));
          }
          setLiveSuites((prev) => applyEvent(prev, event, catalogueRef.current));
        },
        onError: (message) => {
          setRunError(message);
          setRunStatus("error");
          closeStreamRef.current = null;
        },
      },
    );
  }

  async function startRun(suiteIds?: string[]) {
    if (!accessToken) return;
    setIsStarting(true);
    setRunError(null);
    setSummary(null);
    setLiveSuites([]);
    setRunStatus("connecting");

    // Seed live tree from catalogue so the UI shows structure immediately.
    const ids = suiteIds ?? suites?.map((s) => s.id) ?? [];
    const seeded: LiveSuite[] = (suites ?? [])
      .filter((s) => ids.includes(s.id))
      .map((s) => ({
        id: s.id,
        title: s.title,
        scenarios: s.scenarios.map((sc) => ({
          id: sc.id,
          title: sc.title,
          rule: sc.rule,
          status: "pending" as const,
          steps: [],
        })),
      }));
    setLiveSuites(seeded);

    try {
      const res = await testApi.createRun(accessToken, suiteIds);
      startStream(res.data.runId);
    } catch (err) {
      const formatted = formatApiError(err, "Failed to start run.");
      setRunError(formatted.hint ? `${formatted.summary} ${formatted.hint}` : formatted.summary);
      setRunStatus("error");
    } finally {
      setIsStarting(false);
    }
  }

  const isBusy = isStarting || runStatus === "connecting" || runStatus === "running";
  const allSelected = Boolean(suites?.length && selected.size === suites.length);
  const someSelected = selected.size > 0;
  const hasResults = liveSuites.length > 0 || runStatus !== "idle";

  if (isLoading) return <LoadingState label="Loading suites..." />;
  if (loadError) {
    const msg = typeof loadError === "string" ? loadError : loadError.message;
    const hint = typeof loadError === "string" ? undefined : loadError.hint;
    return <ErrorState message={msg} hint={hint} onRetry={loadSuites} />;
  }
  if (!suites || suites.length === 0) {
    return <EmptyState title="No suites" description="The test-runner returned an empty catalogue." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-zinc-200 bg-white px-4 py-4">
        <h2 className="text-sm font-semibold text-zinc-900">Test suites</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-zinc-600">
          Run curated scenarios against the live API to prove business rules — payments, status,
          idempotency, auth isolation, and more. Pick suites below, run them, then read the pass/fail
          summary. Expand a scenario only when you need step-level detail.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Catalogue</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              {suites.length} suites available · {selected.size} selected
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="mr-1 flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                className="size-4 rounded border-zinc-300"
                checked={allSelected}
                onChange={(e) => toggleAll(e.target.checked)}
              />
              Select all
            </label>
            <Button
              type="button"
              variant="outline"
              isDisabled={!someSelected || isBusy}
              isPending={isStarting}
              onPress={() => startRun(Array.from(selected))}
            >
              Run selected
            </Button>
            <Button type="button" isDisabled={isBusy} isPending={isStarting} onPress={() => startRun()}>
              Run all
            </Button>
          </div>
        </div>

        <ul className="space-y-3">
          {suites.map((suite, suiteIndex) => (
            <SuiteCard
              key={`catalogue-${suite.id}-${suiteIndex}`}
              suite={suite}
              checked={selected.has(suite.id)}
              disabled={isBusy}
              onToggle={() => toggleSuite(suite.id)}
              onRun={() => startRun([suite.id])}
            />
          ))}
        </ul>
      </section>

      {hasResults ? (
        <section className="flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Latest run</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Overall outcome first — drill into scenarios only if something failed or you need proof.
            </p>
          </div>
          <RunResults
            suites={liveSuites}
            summary={summary}
            runStatus={runStatus}
            errorMessage={runError}
          />
        </section>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import type { RunSummary, ScenarioStatus, StepResult } from "@/lib/api/types";
import { StatusBadge } from "./StatusBadge";
import { StepDetail } from "./StepDetail";

export interface LiveStep {
  index: number;
  name: string;
  status: ScenarioStatus;
  result?: StepResult;
}

export interface LiveScenario {
  id: string;
  title: string;
  rule: string;
  status: ScenarioStatus;
  durationMs?: number;
  steps: LiveStep[];
}

export interface LiveSuite {
  id: string;
  title: string;
  scenarios: LiveScenario[];
}

function formatMs(ms: number | undefined): string {
  if (ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function failedScenarioTitles(suites: LiveSuite[]): string[] {
  return suites.flatMap((suite) =>
    suite.scenarios.filter((sc) => sc.status === "failed").map((sc) => sc.title),
  );
}

function outcomeHeadline(
  runStatus: string,
  summary: RunSummary | null,
): { title: string; subtitle: string; tone: "neutral" | "ok" | "bad" | "warn" } {
  if (runStatus === "connecting") {
    return { title: "Starting run…", subtitle: "Connecting to the live stream.", tone: "warn" };
  }
  if (runStatus === "running") {
    return { title: "Run in progress…", subtitle: "Scenarios update as each step finishes.", tone: "warn" };
  }
  if (runStatus === "error") {
    return { title: "Run error", subtitle: "The runner stopped before a normal finish.", tone: "bad" };
  }
  if (summary) {
    if (summary.failed > 0) {
      return {
        title: `${summary.failed} failed`,
        subtitle:
          summary.failed === 1
            ? "One scenario did not meet expectations."
            : `${summary.failed} scenarios did not meet expectations.`,
        tone: "bad",
      };
    }
    if (runStatus === "passed" || summary.passed > 0) {
      return {
        title: "All passed",
        subtitle: `${summary.passed} of ${summary.total} scenarios passed.`,
        tone: "ok",
      };
    }
  }
  return { title: "Results", subtitle: "Waiting for the run to finish.", tone: "neutral" };
}

const TONE_BORDER: Record<string, string> = {
  neutral: "border-zinc-200 bg-white",
  ok: "border-emerald-200 bg-emerald-50/40",
  bad: "border-red-200 bg-red-50/40",
  warn: "border-amber-200 bg-amber-50/40",
};

function StepRow({ step }: { step: LiveStep }) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(step.result);

  return (
    <li className="rounded border border-zinc-200 bg-white px-3 py-2">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 text-left"
        onClick={() => expandable && setOpen((v) => !v)}
        disabled={!expandable}
      >
        <div className="min-w-0">
          <p className="truncate text-sm text-zinc-800">{step.name}</p>
          {step.result ? (
            <p className="text-xs text-zinc-500">{formatMs(step.result.durationMs)}</p>
          ) : null}
        </div>
        <StatusBadge status={step.status} />
      </button>
      {open && step.result ? <StepDetail step={step.result} /> : null}
    </li>
  );
}

function ScenarioCard({ scenario }: { scenario: LiveScenario }) {
  const [open, setOpen] = useState(scenario.status === "running" || scenario.status === "failed");

  useEffect(() => {
    if (scenario.status === "failed" || scenario.status === "running") {
      setOpen(true);
    } else if (scenario.status === "passed" || scenario.status === "skipped") {
      setOpen(false);
    }
  }, [scenario.status]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50/50">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-zinc-900">{scenario.title}</p>
          <p className="mt-0.5 text-xs text-zinc-500">{scenario.rule}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {scenario.durationMs !== undefined ? (
            <span className="text-xs text-zinc-500">{formatMs(scenario.durationMs)}</span>
          ) : null}
          <StatusBadge status={scenario.status} />
        </div>
      </button>
      {open ? (
        <ul className="space-y-2 border-t border-zinc-200 px-4 py-3">
          {scenario.steps.length === 0 ? (
            <li className="text-xs text-zinc-500">Waiting for steps…</li>
          ) : (
            scenario.steps.map((step, stepIndex) => (
              <StepRow key={`${scenario.id}-step-${step.index}-${stepIndex}`} step={step} />
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function SummaryStrip({
  runStatus,
  summary,
  failedTitles,
}: {
  runStatus: string;
  summary: RunSummary | null;
  failedTitles: string[];
}) {
  const outcome = outcomeHeadline(runStatus, summary);

  return (
    <div className={`rounded-lg border px-4 py-4 ${TONE_BORDER[outcome.tone]}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-zinc-900">{outcome.title}</h3>
            <StatusBadge status={runStatus} />
          </div>
          <p className="mt-1 text-sm text-zinc-600">{outcome.subtitle}</p>
        </div>
        {summary ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-zinc-500">Passed</dt>
              <dd className="font-semibold text-emerald-700">{summary.passed}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Failed</dt>
              <dd className="font-semibold text-red-700">{summary.failed}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Skipped</dt>
              <dd className="font-medium text-zinc-700">{summary.skipped}</dd>
            </div>
            <div>
              <dt className="text-xs text-zinc-500">Elapsed</dt>
              <dd className="font-medium text-zinc-700">{formatMs(summary.elapsedMs)}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      {summary?.apiBaseUrl ? (
        <p className="mt-3 truncate text-xs text-zinc-400">API {summary.apiBaseUrl}</p>
      ) : null}

      {failedTitles.length > 0 ? (
        <div className="mt-3 border-t border-red-200/80 pt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-red-700">Failed scenarios</p>
          <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-sm text-red-800">
            {failedTitles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function RunResults({
  suites,
  summary,
  runStatus,
  errorMessage,
}: {
  suites: LiveSuite[];
  summary: RunSummary | null;
  runStatus: string;
  errorMessage?: string | null;
}) {
  if (suites.length === 0 && runStatus === "idle") {
    return null;
  }

  const failedTitles = failedScenarioTitles(suites);
  const showDetails = suites.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <SummaryStrip runStatus={runStatus} summary={summary} failedTitles={failedTitles} />

      {errorMessage ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {showDetails ? (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Scenario details</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Failed and in-progress scenarios expand automatically. Expand a passed scenario to inspect
              steps.
            </p>
          </div>
          {suites.map((suite, suiteIndex) => (
            <section key={`suite-${suite.id}-${suiteIndex}`} className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {suite.title}
              </h4>
              <div className="space-y-2">
                {suite.scenarios.map((scenario, scenarioIndex) => (
                  <ScenarioCard
                    key={`scenario-${suite.id}-${scenario.id}-${scenarioIndex}`}
                    scenario={scenario}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

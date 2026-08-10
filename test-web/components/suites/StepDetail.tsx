"use client";

import type { StepResult } from "@/lib/api/types";

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined) {
    return <span className="text-zinc-400">—</span>;
  }
  return (
    <pre className="max-h-64 overflow-auto rounded border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-800">
      {typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </pre>
  );
}

function HttpSections({ step }: { step: StepResult }) {
  return (
    <>
      {step.error && step.kind !== "parallel" ? (
        <p className="text-sm text-red-700">{step.error}</p>
      ) : null}

      {step.request ? (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Request</h4>
          <p className="font-mono text-xs text-zinc-700">
            {step.request.method} {step.request.path}
          </p>
          {step.request.headers ? <JsonBlock value={step.request.headers} /> : null}
          {step.request.body !== undefined ? <JsonBlock value={step.request.body} /> : null}
        </section>
      ) : null}

      {step.response ? (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Response</h4>
          <p className="font-mono text-xs text-zinc-700">HTTP {step.response.status}</p>
          <JsonBlock value={step.response.body} />
        </section>
      ) : null}

      {step.assertions && step.assertions.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Assertions</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-zinc-500">
                  <th className="py-1.5 pr-3 font-medium">Path</th>
                  <th className="py-1.5 pr-3 font-medium">Expected</th>
                  <th className="py-1.5 pr-3 font-medium">Actual</th>
                  <th className="py-1.5 font-medium">Result</th>
                </tr>
              </thead>
              <tbody>
                {step.assertions.map((a, i) => (
                  <tr
                    key={`${a.path}-${i}`}
                    className={a.passed ? "text-zinc-700" : "bg-red-50 text-red-800"}
                  >
                    <td className="py-1.5 pr-3 font-mono">{a.path}</td>
                    <td className="py-1.5 pr-3 font-mono">{JSON.stringify(a.expected)}</td>
                    <td className="py-1.5 pr-3 font-mono">{JSON.stringify(a.actual)}</td>
                    <td className="py-1.5">{a.passed ? "pass" : "fail"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  );
}

function raceAttemptLabel(child: StepResult): { label: string; className: string } {
  const status = child.response?.status;
  if (status !== undefined && status >= 200 && status < 300) {
    return { label: `Accepted · HTTP ${status}`, className: "text-emerald-700" };
  }
  if (status !== undefined) {
    return {
      label: `Rejected by API · HTTP ${status}`,
      className: "text-amber-800",
    };
  }
  if (child.status === "passed") {
    return { label: "Succeeded", className: "text-emerald-700" };
  }
  return { label: child.error ?? "Failed", className: "text-red-700" };
}

function ChildAttempt({ child }: { child: StepResult }) {
  const outcome = raceAttemptLabel(child);
  const isRace = child.phase !== "after";

  return (
    <details className="rounded border border-zinc-200 bg-white" open={isRace || child.status === "failed"}>
      <summary className="cursor-pointer list-none px-3 py-2 [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">{child.name}</p>
            <p className={`mt-0.5 text-xs ${outcome.className}`}>{outcome.label}</p>
            {isRace && child.status === "failed" && child.response ? (
              <p className="mt-0.5 text-xs text-zinc-500">
                Expected for the race loser — one payment must be rejected so paid never exceeds total.
              </p>
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-zinc-500">{child.durationMs}ms</span>
        </div>
      </summary>
      <div className="space-y-3 border-t border-zinc-100 px-3 py-3">
        <HttpSections step={child} />
      </div>
    </details>
  );
}

function ParallelDetail({ step }: { step: StepResult }) {
  const summary = step.parallelSummary;
  const countsMatch =
    summary &&
    summary.successCount === summary.expectedSuccess &&
    summary.failureCount === summary.expectedFailure;

  const concurrent = (step.children ?? []).filter((c) => c.phase !== "after");
  const after = (step.children ?? []).filter((c) => c.phase === "after");
  // Older payloads may omit phase — treat all as concurrent if none tagged after.
  const raceChildren = concurrent.length > 0 ? concurrent : step.children ?? [];
  const followUps = concurrent.length > 0 ? after : [];

  return (
    <div className="mt-3 space-y-4 border-t border-zinc-100 pt-3">
      {step.error ? <p className="text-sm text-red-700">{step.error}</p> : null}

      {summary ? (
        <section
          className={`rounded-md border px-3 py-2 text-sm ${
            countsMatch
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-red-200 bg-red-50 text-red-900"
          }`}
        >
          <p className="font-medium">Race outcome</p>
          <p className="mt-1 text-xs leading-relaxed">
            Expected {summary.expectedSuccess} accepted / {summary.expectedFailure} rejected → got{" "}
            {summary.successCount} / {summary.failureCount}
            {countsMatch ? " (guard held)" : " (unexpected)"}
          </p>
        </section>
      ) : (
        <p className="text-sm text-zinc-600">
          Parallel step — expand each attempt below to see which API calls were accepted or rejected.
        </p>
      )}

      {raceChildren.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Concurrent attempts
          </h4>
          {raceChildren.map((child, i) => (
            <ChildAttempt key={`${child.name}-${i}`} child={child} />
          ))}
        </section>
      ) : null}

      {followUps.length > 0 ? (
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            After the race
          </h4>
          {followUps.map((child, i) => (
            <ChildAttempt key={`${child.name}-after-${i}`} child={child} />
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function StepDetail({ step }: { step: StepResult }) {
  if (step.kind === "parallel" || step.parallelSummary || (step.children && step.children.length > 0)) {
    return <ParallelDetail step={step} />;
  }

  return (
    <div className="mt-3 space-y-4 border-t border-zinc-100 pt-3">
      <HttpSections step={step} />
    </div>
  );
}

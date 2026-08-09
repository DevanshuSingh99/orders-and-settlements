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

export function StepDetail({ step }: { step: StepResult }) {
  return (
    <div className="mt-3 space-y-4 border-t border-zinc-100 pt-3">
      {step.error ? <p className="text-sm text-red-700">{step.error}</p> : null}

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
                    <td className="py-1.5 pr-3 font-mono">
                      {JSON.stringify(a.expected)}
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{JSON.stringify(a.actual)}</td>
                    <td className="py-1.5">{a.passed ? "pass" : "fail"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

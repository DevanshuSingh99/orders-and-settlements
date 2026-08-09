import type { ScenarioStatus, StepStatus } from "@/lib/api/types";

const STYLES: Record<string, string> = {
  pending: "bg-zinc-100 text-zinc-600",
  running: "bg-amber-50 text-amber-800",
  passed: "bg-emerald-50 text-emerald-800",
  failed: "bg-red-50 text-red-700",
  skipped: "bg-zinc-100 text-zinc-500",
  idle: "bg-zinc-100 text-zinc-600",
  connecting: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700",
  finished: "bg-emerald-50 text-emerald-800",
};

export function StatusBadge({ status }: { status: StepStatus | ScenarioStatus | string }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-xs font-medium capitalize ${STYLES[status] ?? STYLES.pending}`}
    >
      {status}
    </span>
  );
}

import { Card } from "@heroui/react";
import { formatCurrency } from "@/lib/format";
import type { OrderSummary } from "@/lib/api/types";

/**
 * Four quiet metrics, per docs/implementation-plan.md section 17 - this is
 * a financial operations screen, not a marketing dashboard, so we keep it
 * to the numbers that matter and nothing more.
 */
export function SummaryCards({ summary }: { summary: OrderSummary }) {
  const cards = [
    { label: "Outstanding", value: formatCurrency(summary.totalOutstanding) },
    { label: "Collected", value: formatCurrency(summary.totalCollected) },
    { label: "Overdue orders", value: String(summary.overdueCount) },
    { label: "Pending orders", value: String(summary.pendingCount) },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.label}>
          <Card.Content className="py-4">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold text-zinc-900">{card.value}</p>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

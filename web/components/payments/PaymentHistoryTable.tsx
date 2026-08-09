import { Table } from "@heroui/react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Payment, Refund } from "@/lib/api/types";
import { EmptyState } from "@/components/ui/PageState";

type HistoryRow =
  | { id: string; kind: "payment"; date: string; amount: number; note: string | null; createdAt: string }
  | { id: string; kind: "refund"; date: string; amount: number; note: string | null; createdAt: string };

function mergeHistory(payments: Payment[], refunds: Refund[]): HistoryRow[] {
  const rows: HistoryRow[] = [
    ...payments.map((payment) => ({
      id: payment.id,
      kind: "payment" as const,
      date: payment.paymentDate,
      amount: payment.amount,
      note: payment.note,
      createdAt: payment.createdAt,
    })),
    ...refunds.map((refund) => ({
      id: refund.id,
      kind: "refund" as const,
      date: refund.refundDate,
      amount: refund.amount,
      note: refund.note,
      createdAt: refund.createdAt,
    })),
  ];

  return rows.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Merged payment + refund history for an order: date, type, signed amount, note. */
export function PaymentHistoryTable({ payments, refunds }: { payments: Payment[]; refunds: Refund[] }) {
  const rows = mergeHistory(payments, refunds);

  if (rows.length === 0) {
    return <EmptyState title="No payments or refunds recorded yet" />;
  }

  return (
    <Table aria-label="Payment and refund history">
      <Table.ScrollContainer>
        <Table.Content aria-label="Payment and refund history">
          <Table.Header>
            <Table.Column isRowHeader>Date</Table.Column>
            <Table.Column>Type</Table.Column>
            <Table.Column>Amount</Table.Column>
            <Table.Column>Note</Table.Column>
          </Table.Header>
          <Table.Body renderEmptyState={() => null}>
            {rows.map((row) => (
              <Table.Row key={`${row.kind}-${row.id}`} id={`${row.kind}-${row.id}`}>
                <Table.Cell>{formatDate(row.date)}</Table.Cell>
                <Table.Cell>{row.kind === "payment" ? "Payment" : "Refund"}</Table.Cell>
                <Table.Cell className={row.kind === "refund" ? "text-red-700" : undefined}>
                  {formatCurrency(row.kind === "refund" ? -row.amount : row.amount)}
                </Table.Cell>
                <Table.Cell className="text-zinc-500">{row.note ?? "—"}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

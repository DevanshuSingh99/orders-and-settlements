/**
 * CSV helpers for the orders export endpoint. Escapes fields per RFC 4180
 * so customer names with commas/quotes/newlines stay in a single cell.
 */
import { calculateAmountDueCents, fromCents } from '@oas/shared-domain';
import type { OrderRowWithStatus } from './repository';

export const CSV_HEADER = 'id,customer,status,total,paid,due,dueDate,createdAt';

export function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatMoney(cents: number): string {
  return fromCents(cents).toFixed(2);
}

function formatCreatedAt(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

/** pg may return DATE columns as string or Date depending on driver/types. */
function formatDueDate(value: string | Date): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).slice(0, 10);
}

export function orderToCsvRow(order: OrderRowWithStatus): string {
  const totalCents = Number(order.total_cents);
  const paidCents = Number(order.paid_amount_cents);
  const dueCents = calculateAmountDueCents(totalCents, paidCents);

  const fields = [
    order.id,
    order.customer,
    order.status,
    formatMoney(totalCents),
    formatMoney(paidCents),
    formatMoney(dueCents),
    formatDueDate(order.due_date),
    formatCreatedAt(order.created_at),
  ];

  return fields.map(escapeCsvField).join(',');
}

export function ordersToCsv(orders: OrderRowWithStatus[]): string {
  const lines = [CSV_HEADER, ...orders.map(orderToCsvRow)];
  // Trailing newline keeps the last row well-formed for spreadsheet tools.
  return `${lines.join('\n')}\n`;
}

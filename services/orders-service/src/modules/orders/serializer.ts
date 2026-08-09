/**
 * Converts internal cents-based DB rows into the API's decimal-dollar JSON
 * shape. This is the ONLY place that formats an order for a response, so
 * every endpoint (list, detail, create, update) looks identical.
 */
import { fromCents, calculateAmountDueCents, type OrderStatus } from '@oas/shared-domain';
import type { LineItemRow, OrderRowWithStatus } from './repository';

export function serializeLineItem(row: LineItemRow) {
  return {
    id: row.id,
    description: row.description,
    quantity: row.quantity,
    unitPrice: fromCents(Number(row.unit_price_cents)),
    lineTotal: fromCents(Number(row.line_total_cents)),
  };
}

export function serializeOrder(order: OrderRowWithStatus, lineItems?: LineItemRow[]) {
  const totalCents = Number(order.total_cents);
  const paidCents = Number(order.paid_amount_cents);
  const dueCents = calculateAmountDueCents(totalCents, paidCents);

  return {
    id: order.id,
    customer: order.customer,
    dueDate: order.due_date,
    status: order.status as OrderStatus,
    total: fromCents(totalCents),
    paid: fromCents(paidCents),
    due: fromCents(dueCents),
    // Once a payment exists, financial fields (line items, quantities,
    // prices) become immutable - see docs/implementation-plan.md section 14.
    // The frontend uses this flag to decide whether to show line-item editing.
    isEditable: paidCents === 0,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    ...(lineItems ? { lineItems: lineItems.map(serializeLineItem) } : {}),
  };
}

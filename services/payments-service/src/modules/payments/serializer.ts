/** Converts internal cents-based rows into the API's decimal-dollar JSON shape. */
import { calculateAmountDueCents, deriveOrderStatus, fromCents } from '@oas/shared-domain';
import type { OrderSnapshot, PaymentRow } from './repository';

export function serializePayment(payment: PaymentRow) {
  return {
    id: payment.id,
    orderId: payment.order_id,
    amount: fromCents(Number(payment.amount_cents)),
    paymentDate: payment.payment_date,
    note: payment.note,
    createdAt: payment.created_at,
  };
}

/** Renders the order's post-payment financial state - total/paid/due/status - so the client never has to recompute it. */
export function serializeOrderSnapshot(order: OrderSnapshot) {
  const totalCents = Number(order.total_cents);
  const paidCents = Number(order.paid_amount_cents);
  const dueCents = calculateAmountDueCents(totalCents, paidCents);
  const status = deriveOrderStatus({
    totalCents,
    paidCents,
    dueDate: new Date(order.due_date),
    now: new Date(),
  });

  return {
    id: order.id,
    total: fromCents(totalCents),
    paid: fromCents(paidCents),
    due: fromCents(dueCents),
    status,
  };
}

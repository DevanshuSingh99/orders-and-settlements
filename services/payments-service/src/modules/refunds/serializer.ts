/** Converts internal cents-based refund rows into the API's decimal-dollar JSON shape. */
import { fromCents } from '@oas/shared-domain';
import type { RefundRow } from './repository';

export function serializeRefund(refund: RefundRow) {
  return {
    id: refund.id,
    orderId: refund.order_id,
    amount: fromCents(Number(refund.amount_cents)),
    refundDate: refund.refund_date,
    note: refund.note,
    createdAt: refund.created_at,
  };
}

export { serializeOrderSnapshot } from '../payments/serializer';

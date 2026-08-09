/**
 * Payment amount validation - the invariant that must hold no matter what
 * concurrency strategy a service uses (see payments-service's guarded
 * atomic UPDATE for how this is enforced safely under concurrent requests).
 */

export interface ValidatePaymentResult {
  ok: boolean;
  /** Present when ok=false. The maximum amount that would NOT be rejected. */
  remainingCents?: number;
}

/**
 * A payment is valid only if:
 *   - it is at least 1 cent (amount >= 0.01), and
 *   - totalPaidAfter (existing paid + this payment) does not exceed the order total.
 *
 * This is the pure decision function; the payments-service additionally
 * enforces it atomically at the database level so two concurrent requests
 * can never both pass this check and together overpay the order.
 */
export function validatePaymentAmount(params: {
  amountCents: number;
  alreadyPaidCents: number;
  orderTotalCents: number;
}): ValidatePaymentResult {
  const { amountCents, alreadyPaidCents, orderTotalCents } = params;

  if (amountCents < 1) {
    return { ok: false, remainingCents: Math.max(orderTotalCents - alreadyPaidCents, 0) };
  }

  const remainingCents = orderTotalCents - alreadyPaidCents;

  if (amountCents > remainingCents) {
    return { ok: false, remainingCents: Math.max(remainingCents, 0) };
  }

  return { ok: true };
}

export interface ValidateRefundResult {
  ok: boolean;
  /** Present when ok=false. The maximum amount currently refundable (amount paid). */
  maxRefundableCents?: number;
}

/**
 * A refund is valid only if:
 *   - it is at least 1 cent (amount >= 0.01), and
 *   - it does not exceed the order's current paid_amount_cents.
 *
 * Pure decision function; payments-service additionally enforces the
 * paid decrement atomically so concurrent refunds cannot drive paid below 0.
 */
export function validateRefundAmount(params: {
  amountCents: number;
  paidCents: number;
}): ValidateRefundResult {
  const { amountCents, paidCents } = params;

  if (amountCents < 1) {
    return { ok: false, maxRefundableCents: Math.max(paidCents, 0) };
  }

  if (amountCents > paidCents) {
    return { ok: false, maxRefundableCents: Math.max(paidCents, 0) };
  }

  return { ok: true };
}

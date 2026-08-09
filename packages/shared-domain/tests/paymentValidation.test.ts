import { validatePaymentAmount, validateRefundAmount } from '../src/paymentValidation';

describe('validatePaymentAmount', () => {
  it('accepts a partial payment within the remaining balance', () => {
    // $1,000 order, $400 payment -> valid, matches the assignment sample scenario step 2.
    const result = validatePaymentAmount({ amountCents: 40000, alreadyPaidCents: 0, orderTotalCents: 100000 });
    expect(result.ok).toBe(true);
  });

  it('accepts a payment that exactly completes the order', () => {
    // $1,000 order, already paid $400, pay $600 -> exactly fills to $1,000 (sample scenario step 3).
    const result = validatePaymentAmount({ amountCents: 60000, alreadyPaidCents: 40000, orderTotalCents: 100000 });
    expect(result.ok).toBe(true);
  });

  it('rejects a payment that would exceed the order total, with the exact remaining amount', () => {
    // Order fully paid at $1,000, attempt another $1 -> rejected (sample scenario step 4).
    const result = validatePaymentAmount({ amountCents: 100, alreadyPaidCents: 100000, orderTotalCents: 100000 });
    expect(result.ok).toBe(false);
    expect(result.remainingCents).toBe(0);
  });

  it('rejects an overpayment and reports the correct remaining balance', () => {
    // $1,000 total, $600 already paid, attempt $401 -> remaining is $400.
    const result = validatePaymentAmount({ amountCents: 40100, alreadyPaidCents: 60000, orderTotalCents: 100000 });
    expect(result.ok).toBe(false);
    expect(result.remainingCents).toBe(40000);
  });

  it('rejects an amount below the 1-cent minimum', () => {
    const result = validatePaymentAmount({ amountCents: 0, alreadyPaidCents: 0, orderTotalCents: 100000 });
    expect(result.ok).toBe(false);
  });
});

describe('validateRefundAmount', () => {
  it('accepts a partial refund within the amount paid', () => {
    const result = validateRefundAmount({ amountCents: 40000, paidCents: 100000 });
    expect(result.ok).toBe(true);
  });

  it('accepts a refund that exactly clears the amount paid', () => {
    const result = validateRefundAmount({ amountCents: 100000, paidCents: 100000 });
    expect(result.ok).toBe(true);
  });

  it('rejects a refund that exceeds the amount paid, with the max refundable', () => {
    const result = validateRefundAmount({ amountCents: 40100, paidCents: 40000 });
    expect(result.ok).toBe(false);
    expect(result.maxRefundableCents).toBe(40000);
  });

  it('rejects a refund when nothing has been paid', () => {
    const result = validateRefundAmount({ amountCents: 100, paidCents: 0 });
    expect(result.ok).toBe(false);
    expect(result.maxRefundableCents).toBe(0);
  });

  it('rejects an amount below the 1-cent minimum', () => {
    const result = validateRefundAmount({ amountCents: 0, paidCents: 100000 });
    expect(result.ok).toBe(false);
    expect(result.maxRefundableCents).toBe(100000);
  });
});

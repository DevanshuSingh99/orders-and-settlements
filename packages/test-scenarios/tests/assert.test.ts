import { getByPath, interpolate, runAssertions } from '../src/assert';

describe('assert helpers', () => {
  it('resolves dotted paths', () => {
    expect(getByPath({ data: { order: { due: 400 } } }, 'data.order.due')).toBe(400);
  });

  it('compares assertions', () => {
    const results = runAssertions(
      { error: { code: 'PAYMENT_EXCEEDS_REMAINING_BALANCE', details: { remainingAmount: 400 } } },
      [
        ['error.code', 'PAYMENT_EXCEEDS_REMAINING_BALANCE'],
        ['error.details.remainingAmount', 400],
      ],
    );
    expect(results.every((r) => r.passed)).toBe(true);
  });

  it('interpolates captures', () => {
    expect(interpolate('/api/orders/{orderId}', { orderId: 'abc' })).toBe('/api/orders/abc');
  });
});

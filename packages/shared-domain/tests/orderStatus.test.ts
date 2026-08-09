import { deriveOrderStatus } from '../src/orderStatus';

/**
 * These cases mirror docs/implementation-plan.md section 10 (Status Edge
 * Cases) exactly, including labels A-E, so the doc and the test suite stay
 * in lockstep.
 */
describe('deriveOrderStatus', () => {
  const future = new Date('2999-01-01T00:00:00Z');
  const past = new Date('2000-01-01T00:00:00Z');
  const now = new Date('2500-01-01T00:00:00Z');

  it('Case A: no payments, due date in the future -> pending', () => {
    expect(deriveOrderStatus({ totalCents: 100000, paidCents: 0, dueDate: future, now })).toBe('pending');
  });

  it('Case B: partial payment, due date in the future -> partially_paid', () => {
    expect(deriveOrderStatus({ totalCents: 100000, paidCents: 40000, dueDate: future, now })).toBe('partially_paid');
  });

  it('Case C: fully paid, due date in the future -> paid', () => {
    expect(deriveOrderStatus({ totalCents: 100000, paidCents: 100000, dueDate: future, now })).toBe('paid');
  });

  it('Case D: partial payment, due date in the past -> overdue', () => {
    expect(deriveOrderStatus({ totalCents: 100000, paidCents: 40000, dueDate: past, now })).toBe('overdue');
  });

  it('Case E: fully paid, due date in the past -> paid (not overdue)', () => {
    expect(deriveOrderStatus({ totalCents: 100000, paidCents: 100000, dueDate: past, now })).toBe('paid');
  });

  it('no payments, due date in the past -> overdue', () => {
    expect(deriveOrderStatus({ totalCents: 100000, paidCents: 0, dueDate: past, now })).toBe('overdue');
  });

  it('due date exactly "now" is not yet overdue (must be strictly past)', () => {
    const dueDate = new Date('2024-06-01T12:00:00Z');
    expect(
      deriveOrderStatus({ totalCents: 100000, paidCents: 0, dueDate, now: dueDate }),
    ).toBe('pending');
  });
});

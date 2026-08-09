import {
  estimatePaymentOps,
  estimateTotalOps,
  getLoadLimitsResponse,
  LOAD_LIMITS,
  LOAD_PRESETS,
  validateLoadProfile,
} from '../src/engine/loadProfile';

describe('load profile caps', () => {
  it('exposes hard caps and three presets', () => {
    const { limits, presets } = getLoadLimitsResponse();
    expect(limits.maxUsers).toBe(5);
    expect(limits.maxOrders).toBe(2000);
    expect(limits.maxPayments).toBe(2000);
    expect(limits.maxConcurrency).toBe(20);
    expect(limits.maxBurstParallel).toBe(10);
    expect(limits.maxTotalOps).toBe(5000);
    expect(limits.maxTimeoutMs).toBe(10 * 60 * 1000);
    expect(presets.smoke).toBeDefined();
    expect(presets.baseline).toBeDefined();
    expect(presets.stress).toBeDefined();
  });

  it('accepts the baseline preset under caps', () => {
    const result = validateLoadProfile(LOAD_PRESETS.baseline);
    expect(result.ok).toBe(true);
    expect(result.estimates!.totalOps).toBeLessThanOrEqual(LOAD_LIMITS.maxTotalOps);
    expect(result.estimates!.payments).toBeLessThanOrEqual(LOAD_LIMITS.maxPayments);
  });

  it('accepts smoke and stress presets', () => {
    expect(validateLoadProfile(LOAD_PRESETS.smoke).ok).toBe(true);
    expect(validateLoadProfile(LOAD_PRESETS.stress).ok).toBe(true);
  });

  it('rejects over-cap users', () => {
    const result = validateLoadProfile({
      ...LOAD_PRESETS.smoke,
      users: LOAD_LIMITS.maxUsers + 1,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('users'))).toBe(true);
  });

  it('rejects when derived total ops exceed 5000', () => {
    const result = validateLoadProfile({
      name: 'too-big',
      users: 5,
      concurrency: 20,
      thinkTimeMs: 0,
      orders: { count: 2000, total: 1000, dueInDays: 14 },
      payments: { partialFraction: 1, payRemainingOnHalf: true },
      burst: { enabled: true, amount: 600, parallel: 10 },
    });
    // payments = 2000 + 1000 = 3000; total = 5+2000+3000+10 = 5015
    expect(estimatePaymentOps(result.profile ?? {
      name: 'x',
      users: 5,
      concurrency: 20,
      thinkTimeMs: 0,
      orders: { count: 2000, total: 1000, dueInDays: 14 },
      payments: { partialFraction: 1, payRemainingOnHalf: true },
      burst: { enabled: true, amount: 600, parallel: 10 },
    })).toBe(3000);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/total ops|payment ops/i);
  });

  it('rejects thinkTimeMs above 500', () => {
    const result = validateLoadProfile({
      ...LOAD_PRESETS.smoke,
      thinkTimeMs: 501,
    });
    expect(result.ok).toBe(false);
  });

  it('estimates total ops as users + orders + payments + burst', () => {
    const profile = LOAD_PRESETS.smoke;
    const payments = estimatePaymentOps(profile);
    expect(estimateTotalOps(profile)).toBe(
      profile.users + profile.orders.count + payments + profile.burst.parallel,
    );
  });
});

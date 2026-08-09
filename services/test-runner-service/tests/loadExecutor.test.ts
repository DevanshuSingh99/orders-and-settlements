import {
  buildLatencyHistogram,
  extractErrorMessage,
  LATENCY_BOUNDS_MS,
  LATENCY_INF_LE,
  sanitizeMessage,
} from '../src/engine/loadExecutor';

describe('loadExecutor aggregations', () => {
  it('builds latency histogram with fixed bounds and open-ended bucket', () => {
    const hist = buildLatencyHistogram([10, 50, 120, 900, 12000]);
    expect(hist).toHaveLength(LATENCY_BOUNDS_MS.length + 1);
    expect(hist.find((b) => b.le === 50)?.count).toBe(2); // 10 and 50
    expect(hist.find((b) => b.le === 250)?.count).toBe(1); // 120
    expect(hist.find((b) => b.le === 1000)?.count).toBe(1); // 900
    expect(hist[hist.length - 1]).toEqual({ le: LATENCY_INF_LE, count: 1 });
  });

  it('extracts AppError-shaped messages and redacts secrets', () => {
    const msg = extractErrorMessage(
      {
        error: {
          code: 'PAYMENT_EXCEEDS_REMAINING',
          message: 'Amount exceeds remaining for user@test.local',
        },
      },
      'fallback',
    );
    expect(msg).toContain('PAYMENT_EXCEEDS_REMAINING');
    expect(msg).toContain('[email]');
    expect(msg).not.toContain('user@test.local');
  });

  it('sanitizes bearer tokens and passwords in free-form strings', () => {
    const out = sanitizeMessage('Bearer eyJhbGciOiJIUzI1NiJ9.abc.def "password":"secret"');
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('secret');
  });
});

import {
  toCents,
  fromCents,
  formatCents,
  sumCents,
  calculateLineTotalCents,
  calculateOrderTotalCents,
  calculateAmountDueCents,
  InvalidMoneyValueError,
} from '../src/money';

describe('toCents', () => {
  it('converts whole dollar amounts', () => {
    expect(toCents(1000)).toBe(100000);
    expect(toCents('1000')).toBe(100000);
  });

  it('converts amounts with cents', () => {
    expect(toCents(400.25)).toBe(40025);
    expect(toCents(10.5)).toBe(1050);
    expect(toCents(1.0)).toBe(100);
  });

  it('handles known floating point drift cases correctly', () => {
    // 0.1 + 0.2 famously does not equal 0.3 in binary floating point.
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(toCents(19.99)).toBe(1999);
    expect(toCents(29.99)).toBe(2999);
  });

  it('rejects sub-cent precision instead of silently rounding', () => {
    expect(() => toCents(400.256)).toThrow(InvalidMoneyValueError);
  });

  it('rejects non-numeric and non-finite input', () => {
    expect(() => toCents('abc')).toThrow(InvalidMoneyValueError);
    expect(() => toCents(NaN)).toThrow(InvalidMoneyValueError);
    expect(() => toCents(Infinity)).toThrow(InvalidMoneyValueError);
  });
});

describe('fromCents / formatCents', () => {
  it('round-trips cleanly with toCents', () => {
    expect(fromCents(toCents(400.25))).toBe(400.25);
    expect(fromCents(100000)).toBe(1000);
  });

  it('formats as a USD string', () => {
    expect(formatCents(40000)).toBe('$400.00');
    expect(formatCents(40025)).toBe('$400.25');
  });
});

describe('sumCents', () => {
  it('sums exactly with no drift', () => {
    // $100 + $200 + $300 + $400 = $1000, from the doc's "multiple payments" test.
    expect(sumCents([10000, 20000, 30000, 40000])).toBe(100000);
  });

  it('returns 0 for an empty list', () => {
    expect(sumCents([])).toBe(0);
  });
});

describe('calculateLineTotalCents / calculateOrderTotalCents', () => {
  it('matches the assignment sample scenario: 2 x $500 = $1000', () => {
    expect(calculateLineTotalCents(2, 50000)).toBe(100000);
    expect(
      calculateOrderTotalCents([{ quantity: 2, unitPriceCents: 50000 }]),
    ).toBe(100000);
  });

  it('sums multiple line items', () => {
    const total = calculateOrderTotalCents([
      { quantity: 2, unitPriceCents: 50000 },
      { quantity: 3, unitPriceCents: 1000 },
    ]);
    expect(total).toBe(100000 + 3000);
  });
});

describe('calculateAmountDueCents', () => {
  it('computes total minus paid', () => {
    expect(calculateAmountDueCents(100000, 40000)).toBe(60000);
    expect(calculateAmountDueCents(100000, 100000)).toBe(0);
  });

  it('never goes negative even if paid somehow exceeds total', () => {
    expect(calculateAmountDueCents(100000, 150000)).toBe(0);
  });
});

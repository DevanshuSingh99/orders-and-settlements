/**
 * Money handling.
 *
 * We NEVER use floating point numbers as the source of truth for money.
 * Internally every amount is an integer number of cents (a JS `number` is
 * safe for this up to ~90 trillion dollars, and Postgres stores it as
 * BIGINT). The API boundary accepts/returns plain decimal numbers like
 * `400.25` for convenience, but as soon as a value crosses into the
 * service layer it is converted to cents with `toCents` and stays an
 * integer until the moment it is formatted for display with `formatCents`.
 */

/** Thrown when a caller passes a value that cannot safely represent money. */
export class InvalidMoneyValueError extends Error {
  constructor(value: unknown) {
    super(`Invalid money value: ${JSON.stringify(value)}. Expected a finite, non-negative-safe number or numeric string with at most 2 decimal places.`);
    this.name = 'InvalidMoneyValueError';
  }
}

/**
 * Converts a decimal currency value (e.g. 400.25, "400.25", 1000) into an
 * integer number of cents (40025). Rejects values with sub-cent precision
 * instead of silently rounding, because a client sending 400.256 almost
 * certainly has a bug we want to surface, not hide.
 */
export function toCents(amount: number | string): number {
  const asNumber = typeof amount === 'string' ? Number(amount) : amount;

  if (typeof asNumber !== 'number' || !Number.isFinite(asNumber)) {
    throw new InvalidMoneyValueError(amount);
  }

  // Work in a scaled integer space to avoid binary floating point drift
  // (e.g. 0.1 + 0.2 !== 0.3). Multiplying by 100 and rounding to the
  // nearest integer is safe because we've already validated there are at
  // most 2 decimal places below.
  const scaled = asNumber * 100;
  const rounded = Math.round(scaled);

  // If rounding moved the value by more than a hair, the input had more
  // precision than cents allow (e.g. 400.256) - reject rather than truncate.
  if (Math.abs(scaled - rounded) > 1e-6) {
    throw new InvalidMoneyValueError(amount);
  }

  return rounded;
}

/** Converts integer cents back into a decimal number for API responses (e.g. 40025 -> 400.25). */
export function fromCents(cents: number): number {
  if (!Number.isInteger(cents)) {
    throw new InvalidMoneyValueError(cents);
  }
  return Math.round(cents) / 100;
}

/** Formats cents as a human-readable USD string for error messages and logs (e.g. 40025 -> "$400.25"). */
export function formatCents(cents: number): string {
  return `$${fromCents(cents).toFixed(2)}`;
}

/** Sums an array of cent amounts using plain integer arithmetic (always exact, no drift). */
export function sumCents(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}

/**
 * Computes a single line item's total in cents.
 * quantity is a plain integer (>= 1), unitPriceCents is integer cents (>= 0).
 */
export function calculateLineTotalCents(quantity: number, unitPriceCents: number): number {
  return quantity * unitPriceCents;
}

/**
 * Order total = subtotal = sum of (quantity x unit price) across all lines.
 * There is no order-level tax or discount in this assignment.
 */
export function calculateOrderTotalCents(lineItems: Array<{ quantity: number; unitPriceCents: number }>): number {
  return sumCents(lineItems.map((line) => calculateLineTotalCents(line.quantity, line.unitPriceCents)));
}

/** amountDue = orderTotal - totalPaid (Invariant 2). Never negative in a valid system, but we clamp defensively. */
export function calculateAmountDueCents(totalCents: number, paidCents: number): number {
  return Math.max(totalCents - paidCents, 0);
}

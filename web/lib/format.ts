/** Small formatting helpers shared by every screen, kept in one place so numbers/dates always look the same. */

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Formats a decimal dollar amount (as returned by the API) as e.g. "$1,000.00". */
export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

/** Formats an ISO date string as e.g. "Aug 15, 2026". Works for both date-only and full timestamp strings. */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

/** Converts a Date to the "YYYY-MM-DD" shape the API expects for dueDate/paymentDate. */
export function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

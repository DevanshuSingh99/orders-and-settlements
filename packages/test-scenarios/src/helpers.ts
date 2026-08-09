/** Shared builders for scenario request bodies. */

export function dueDateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function orderBody(params: {
  customer: string;
  total: number;
  dueInDays?: number;
  description?: string;
}) {
  return {
    customer: params.customer,
    dueDate: dueDateOffset(params.dueInDays ?? 14),
    lineItems: [
      {
        description: params.description ?? 'Line item',
        quantity: 1,
        unitPrice: params.total,
      },
    ],
  };
}

export function paymentBody(amount: number, note?: string) {
  return {
    amount,
    paymentDate: dueDateOffset(0),
    ...(note ? { note } : {}),
  };
}

export function refundBody(amount: number, note?: string) {
  return {
    amount,
    refundDate: dueDateOffset(0),
    ...(note ? { note } : {}),
  };
}

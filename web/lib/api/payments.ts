import { api } from "./client";
import type { Order, Payment, RecordPaymentInput } from "./types";

export interface RecordPaymentResult {
  data: { payment: Payment; order: Pick<Order, "id" | "total" | "paid" | "due" | "status"> };
}

export const paymentsApi = {
  list: (orderId: string) => api.get<{ data: Payment[] }>(`/api/orders/${orderId}/payments`),
  record: (orderId: string, input: RecordPaymentInput, idempotencyKey: string) =>
    api.post<RecordPaymentResult>(`/api/orders/${orderId}/payments`, input, idempotencyKey),
};

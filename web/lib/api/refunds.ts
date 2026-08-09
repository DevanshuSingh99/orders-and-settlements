import { api } from "./client";
import type { Order, RecordRefundInput, Refund } from "./types";

export interface RecordRefundResult {
  data: { refund: Refund; order: Pick<Order, "id" | "total" | "paid" | "due" | "status"> };
}

export const refundsApi = {
  list: (orderId: string) => api.get<{ data: Refund[] }>(`/api/orders/${orderId}/refunds`),
  record: (orderId: string, input: RecordRefundInput, idempotencyKey: string) =>
    api.post<RecordRefundResult>(`/api/orders/${orderId}/refunds`, input, idempotencyKey),
};

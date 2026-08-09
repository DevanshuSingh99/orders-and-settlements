import { api } from "./client";
import type { CreateOrderInput, Order, OrderStatus, OrderSummary, Pagination } from "./types";

/** Whitelist matching orders-service list sort enum. */
export type OrderSort =
  | "customer_asc"
  | "customer_desc"
  | "status_asc"
  | "status_desc"
  | "total_asc"
  | "total_desc"
  | "paid_asc"
  | "paid_desc"
  | "due_asc"
  | "due_desc"
  | "dueDate_asc"
  | "dueDate_desc"
  | "createdAt_asc"
  | "createdAt_desc";

export interface ListOrdersParams {
  status?: OrderStatus;
  search?: string;
  page?: number;
  limit?: number;
  sort?: OrderSort;
}

function buildQuery(params: ListOrdersParams): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.sort) query.set("sort", params.sort);
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

export const ordersApi = {
  list: (params: ListOrdersParams = {}) =>
    api.get<{ data: Order[]; pagination: Pagination }>(`/api/orders${buildQuery(params)}`),
  summary: () => api.get<{ data: OrderSummary }>("/api/orders/summary"),
  get: (orderId: string) => api.get<{ data: Order }>(`/api/orders/${orderId}`),
  create: (input: CreateOrderInput) => api.post<{ data: Order }>("/api/orders", input),
  update: (orderId: string, input: Partial<CreateOrderInput>) =>
    api.patch<{ data: Order }>(`/api/orders/${orderId}`, input),
  remove: (orderId: string) => api.delete<{ data: { deleted: boolean } }>(`/api/orders/${orderId}`),
};

/** Shapes returned by the API. Kept in one file so every screen agrees on what an "order" or "payment" looks like. */

export type OrderStatus = "pending" | "partially_paid" | "paid" | "overdue";

export interface User {
  id: string;
  email: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  customer: string;
  dueDate: string;
  status: OrderStatus;
  total: number;
  paid: number;
  due: number;
  isEditable: boolean;
  createdAt: string;
  updatedAt: string;
  lineItems?: LineItem[];
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  paymentDate: string;
  note: string | null;
  createdAt: string;
}

export interface Refund {
  id: string;
  orderId: string;
  amount: number;
  refundDate: string;
  note: string | null;
  createdAt: string;
}

export interface OrderSummary {
  totalOutstanding: number;
  totalCollected: number;
  overdueCount: number;
  pendingCount: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
}

export interface LineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
}

export interface CreateOrderInput {
  customer: string;
  dueDate: string;
  lineItems: LineItemInput[];
}

export interface RecordPaymentInput {
  amount: number;
  paymentDate: string;
  note?: string;
}

export interface RecordRefundInput {
  amount: number;
  refundDate: string;
  note?: string;
}

/** Field-level validation errors as returned by zod's flatten(), keyed by field name. */
export type FieldErrors = Record<string, string[] | undefined>;

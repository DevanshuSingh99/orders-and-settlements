import { Chip } from "@heroui/react";
import type { OrderStatus } from "@/lib/api/types";

/**
 * One place mapping each order status to a label and color, so the
 * dashboard, the order detail page, and the status filter always agree on
 * how a status looks (see docs/implementation-plan.md section 9 - status
 * should be visually obvious but not flashy).
 */
const STATUS_CONFIG: Record<OrderStatus, { label: string; color: "default" | "accent" | "success" | "danger" }> = {
  pending: { label: "Pending", color: "default" },
  partially_paid: { label: "Partially Paid", color: "accent" },
  paid: { label: "Paid", color: "success" },
  overdue: { label: "Overdue", color: "danger" },
};

export function StatusChip({ status }: { status: OrderStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <Chip color={config.color} variant="soft" size="sm">
      {config.label}
    </Chip>
  );
}

export const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = (
  Object.keys(STATUS_CONFIG) as OrderStatus[]
).map((status) => ({ value: status, label: STATUS_CONFIG[status].label }));

"use client";

import Link from "next/link";
import { Table } from "@heroui/react";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatCurrency, formatDate } from "@/lib/format";
import type { OrderSort } from "@/lib/api/orders";
import type { Order } from "@/lib/api/types";

type SortColumn = "customer" | "status" | "total" | "paid" | "due" | "dueDate";

const SORTABLE_COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "customer", label: "Customer" },
  { key: "status", label: "Status" },
  { key: "total", label: "Total" },
  { key: "paid", label: "Paid" },
  { key: "due", label: "Due" },
  { key: "dueDate", label: "Due date" },
];

function parseSort(sort: OrderSort): { column: SortColumn | "createdAt"; direction: "asc" | "desc" } {
  const direction = sort.endsWith("_asc") ? "asc" : "desc";
  const column = sort.replace(/_asc$|_desc$/, "") as SortColumn | "createdAt";
  return { column, direction };
}

function SortHeader({
  label,
  column,
  sort,
  onSortChange,
}: {
  label: string;
  column: SortColumn;
  sort: OrderSort;
  onSortChange: (sort: OrderSort) => void;
}) {
  const { column: activeColumn, direction } = parseSort(sort);
  const isActive = activeColumn === column;

  function handleClick() {
    if (isActive) {
      onSortChange(`${column}_${direction === "asc" ? "desc" : "asc"}` as OrderSort);
    } else {
      onSortChange(`${column}_asc` as OrderSort);
    }
  }

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-0.5 text-left font-medium hover:text-zinc-900 ${
        isActive ? "text-zinc-900" : "text-inherit"
      }`}
      onClick={handleClick}
      aria-label={
        isActive
          ? `${label}, sorted ${direction === "asc" ? "ascending" : "descending"}`
          : `Sort by ${label}`
      }
    >
      {label}
      {isActive ? <span aria-hidden>{direction === "asc" ? " ↑" : " ↓"}</span> : null}
    </button>
  );
}

/** The dashboard's order list: customer, status, total, paid, due, due date - exactly what the assignment asks for. */
export function OrdersTable({
  orders,
  sort,
  onSortChange,
}: {
  orders: Order[];
  sort: OrderSort;
  onSortChange: (sort: OrderSort) => void;
}) {
  return (
    <Table aria-label="Orders">
      <Table.ScrollContainer>
        <Table.Content aria-label="Orders">
          <Table.Header>
            {SORTABLE_COLUMNS.map((col, index) => (
              <Table.Column key={col.key} isRowHeader={index === 0}>
                <SortHeader label={col.label} column={col.key} sort={sort} onSortChange={onSortChange} />
              </Table.Column>
            ))}
          </Table.Header>
          <Table.Body renderEmptyState={() => null}>
            {orders.map((order) => (
              <Table.Row key={order.id} id={order.id}>
                <Table.Cell>
                  <Link href={`/orders/view?id=${order.id}`} className="font-medium text-zinc-900 hover:underline">
                    {order.customer}
                  </Link>
                </Table.Cell>
                <Table.Cell>
                  <StatusChip status={order.status} />
                </Table.Cell>
                <Table.Cell>{formatCurrency(order.total)}</Table.Cell>
                <Table.Cell>{formatCurrency(order.paid)}</Table.Cell>
                <Table.Cell>{formatCurrency(order.due)}</Table.Cell>
                <Table.Cell>{formatDate(order.dueDate)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

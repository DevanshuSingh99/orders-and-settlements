"use client";

import { Button, Label, ListBox, Select } from "@heroui/react";
import type { Pagination } from "@/lib/api/types";

const PAGE_SIZES = [10, 20, 30, 40, 50] as const;

export type PageLimit = (typeof PAGE_SIZES)[number];

/**
 * Server-driven page controls: size select (10–50) plus prev/next.
 * Does not fetch; parent owns page/limit state and refetches on change.
 */
export function OrdersPagination({
  pagination,
  onPageChange,
  onLimitChange,
}: {
  pagination: Pagination;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: PageLimit) => void;
}) {
  const { page, limit, total } = pagination;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-zinc-600">
      <div className="flex items-center gap-2">
        <Select
          className="w-24"
          aria-label="Rows per page"
          value={String(limit)}
          onChange={(value) => {
            if (value == null) return;
            const next = Number(value);
            if (PAGE_SIZES.includes(next as PageLimit)) {
              onLimitChange(next as PageLimit);
            }
          }}
        >
          <Label className="sr-only">Rows per page</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {PAGE_SIZES.map((size) => (
                <ListBox.Item key={size} id={String(size)} textValue={String(size)}>
                  {size}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <span>per page</span>
      </div>

      <div className="flex items-center gap-3">
        <span>
          Page {page} of {totalPages}
          <span className="text-zinc-400"> · {total} total</span>
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" isDisabled={!canPrev} onPress={() => onPageChange(page - 1)}>
            Previous
          </Button>
          <Button size="sm" variant="outline" isDisabled={!canNext} onPress={() => onPageChange(page + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

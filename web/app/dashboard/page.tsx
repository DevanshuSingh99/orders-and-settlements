"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Label, SearchField } from "@heroui/react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { OrdersExport } from "@/components/dashboard/OrdersExport";
import { OrdersPagination, type PageLimit } from "@/components/dashboard/OrdersPagination";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { StatusFilterBar } from "@/components/dashboard/StatusFilterBar";
import { OrdersTable } from "@/components/orders/OrdersTable";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/PageState";
import { ordersApi, type OrderSort } from "@/lib/api/orders";
import { formatApiError, type FormattedApiError } from "@/lib/api/errors";
import type { Order, OrderStatus, OrderSummary, Pagination } from "@/lib/api/types";

function DashboardContent() {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const appliedSearchRef = useRef("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<PageLimit>(10);
  const [sort, setSort] = useState<OrderSort>("createdAt_desc");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [error, setError] = useState<FormattedApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = searchInput.trim();
      if (next === appliedSearchRef.current) return;
      appliedSearchRef.current = next;
      // Batch search + page reset so the list fetches once with both updates.
      setDebouncedSearch(next);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const listParams = {
        ...(status === "all" ? {} : { status }),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        page,
        limit,
        sort,
      };
      const [ordersRes, summaryRes] = await Promise.all([ordersApi.list(listParams), ordersApi.summary()]);
      setOrders(ordersRes.data);
      setPagination(ordersRes.pagination);
      setSummary(summaryRes.data);
    } catch (err) {
      setError(formatApiError(err, "Unable to load your orders right now."));
    } finally {
      setIsLoading(false);
    }
  }, [status, debouncedSearch, page, limit, sort]);

  useEffect(() => {
    // load() only calls setState after its internal `await`s resolve, not
    // synchronously within the effect body - this is the standard
    // fetch-on-mount pattern, not the cascading-render case this rule guards against.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function handleStatusChange(next: OrderStatus | "all") {
    setStatus(next);
    setPage(1);
  }

  function handleSortChange(next: OrderSort) {
    setSort(next);
    setPage(1);
  }

  function handleLimitChange(next: PageLimit) {
    setLimit(next);
    setPage(1);
  }

  const hasActiveFilters = status !== "all" || debouncedSearch.length > 0;
  const total = pagination?.total ?? 0;
  const showEmpty = !isLoading && !error && pagination !== null && total === 0;
  const showTable = !isLoading && !error && orders !== null && total > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-lg font-semibold text-zinc-900">Dashboard</h1>
        <div className="flex flex-col items-stretch gap-3 sm:items-end">
          <Button onPress={() => router.push("/orders/new")}>New order</Button>
          <OrdersExport status={status} search={debouncedSearch} sort={sort} />
        </div>
      </div>

      {summary ? <SummaryCards summary={summary} /> : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <StatusFilterBar value={status} onChange={handleStatusChange} />
        <SearchField
          className="w-full sm:w-64"
          aria-label="Search by customer"
          value={searchInput}
          onChange={setSearchInput}
        >
          <Label className="sr-only">Search by customer</Label>
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Search by customer…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>

      {isLoading ? <LoadingState label="Loading orders..." /> : null}
      {!isLoading && error ? (
        <ErrorState message={error.message} hint={error.hint} onRetry={load} />
      ) : null}
      {showEmpty ? (
        <EmptyState
          title={hasActiveFilters ? "No matching orders" : "No orders yet"}
          description={
            hasActiveFilters
              ? "No orders match this search or status filter."
              : "Create your first order to get started."
          }
        />
      ) : null}
      {showTable && orders ? (
        <>
          <OrdersTable orders={orders} sort={sort} onSortChange={handleSortChange} />
          {pagination ? (
            <OrdersPagination pagination={pagination} onPageChange={setPage} onLimitChange={handleLimitChange} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      <DashboardContent />
    </AuthGuard>
  );
}

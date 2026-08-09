"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@heroui/react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { StatusChip } from "@/components/ui/StatusChip";
import { ErrorState, LoadingState } from "@/components/ui/PageState";
import { FormErrorBanner } from "@/components/ui/FormErrorBanner";
import { LineItemsTable } from "@/components/orders/LineItemsTable";
import { OrderEditForm } from "@/components/orders/OrderEditForm";
import { PaymentHistoryTable } from "@/components/payments/PaymentHistoryTable";
import { RecordPaymentModal } from "@/components/payments/RecordPaymentModal";
import { RecordRefundModal } from "@/components/payments/RecordRefundModal";
import { ApiError } from "@/lib/api/client";
import { formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { ordersApi } from "@/lib/api/orders";
import { paymentsApi } from "@/lib/api/payments";
import { refundsApi } from "@/lib/api/refunds";
import { formatCurrency, formatDate } from "@/lib/format";
import type { Order, Payment, Refund } from "@/lib/api/types";

function OrderDetailContent({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<Order | null>(null);
  const [payments, setPayments] = useState<Payment[] | null>(null);
  const [refunds, setRefunds] = useState<Refund[] | null>(null);
  const [error, setError] = useState<FormattedApiError | string | null>(null);
  const [actionError, setActionError] = useState<FormattedApiError | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setActionError(null);
    try {
      const [orderRes, paymentsRes, refundsRes] = await Promise.all([
        ordersApi.get(orderId),
        paymentsApi.list(orderId),
        refundsApi.list(orderId),
      ]);
      setOrder(orderRes.data);
      setPayments(paymentsRes.data);
      setRefunds(refundsRes.data);
    } catch (err) {
      if (err instanceof ApiError && err.code === "ORDER_NOT_FOUND") {
        setError({
          message: "This order doesn't exist or you don't have access to it.",
          hint: "Return to the dashboard and open another order.",
          code: "ORDER_NOT_FOUND",
          fieldErrors: {},
          summary: "This order doesn't exist or you don't have access to it.",
        });
      } else {
        setError(formatApiError(err, "Unable to load this order right now."));
      }
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    // See app/dashboard/page.tsx for why this fetch-on-mount pattern is safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleDelete() {
    if (!order) return;
    if (!window.confirm("Delete this order? This cannot be undone.")) return;

    setIsDeleting(true);
    setActionError(null);
    try {
      await ordersApi.remove(order.id);
      router.push("/dashboard");
    } catch (err) {
      // Keep the order detail visible — delete failures must not wipe the page.
      setActionError(formatApiError(err, "Unable to delete this order."));
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <LoadingState label="Loading order..." />;
  }

  if (error || !order) {
    const loadError =
      typeof error === "string"
        ? { message: error, hint: undefined }
        : error ?? { message: "Order not found.", hint: undefined };
    return <ErrorState message={loadError.message} hint={loadError.hint} onRetry={load} />;
  }

  if (isEditing) {
    return (
      <OrderEditForm
        order={order}
        onCancel={() => setIsEditing(false)}
        onSaved={() => {
          setIsEditing(false);
          load();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900">{order.customer}</h1>
          <p className="text-sm text-zinc-500">Due {formatDate(order.dueDate)}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={order.status} />
          <Button variant="outline" size="sm" onPress={() => setIsEditing(true)}>
            Edit order
          </Button>
          {order.isEditable ? (
            <Button variant="danger-soft" size="sm" isPending={isDeleting} onPress={handleDelete}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>

      <FormErrorBanner error={actionError} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card>
          <Card.Content className="py-4">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Order total</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{formatCurrency(order.total)}</p>
          </Card.Content>
        </Card>
        <Card>
          <Card.Content className="py-4">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Amount paid</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{formatCurrency(order.paid)}</p>
          </Card.Content>
        </Card>
        <Card>
          <Card.Content className="py-4">
            <p className="text-xs font-medium tracking-wide text-zinc-500 uppercase">Amount due</p>
            <p className="mt-1 text-xl font-semibold text-zinc-900">{formatCurrency(order.due)}</p>
          </Card.Content>
        </Card>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-900">Line items</h2>
        <LineItemsTable lineItems={order.lineItems ?? []} />
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-zinc-900">Payment history</h2>
          <div className="flex items-center gap-2">
            <RecordPaymentModal orderId={order.id} remainingDue={order.due} onRecorded={load} />
            <RecordRefundModal orderId={order.id} amountPaid={order.paid} onRecorded={load} />
          </div>
        </div>
        <PaymentHistoryTable payments={payments ?? []} refunds={refunds ?? []} />
      </section>
    </div>
  );
}

function OrderDetailPageInner() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("id");

  if (!orderId) {
    return <ErrorState message="No order specified. Open an order from the dashboard." />;
  }

  return <OrderDetailContent orderId={orderId} />;
}

export default function OrderDetailPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<LoadingState />}>
        <OrderDetailPageInner />
      </Suspense>
    </AuthGuard>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { OrderLineItemsEditor } from "@/components/orders/OrderLineItemsEditor";
import { FormErrorBanner } from "@/components/ui/FormErrorBanner";
import { firstFieldMessage, formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { ordersApi } from "@/lib/api/orders";
import { toDateInputValue } from "@/lib/format";
import { emptyLineItem, validateLineItem, type LineItemDraft, type LineItemDraftErrors } from "@/lib/validation/orderForm";

function defaultDueDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 7);
  return toDateInputValue(date);
}

function NewOrderContent() {
  const router = useRouter();
  const [lineItems, setLineItems] = useState<LineItemDraft[]>([emptyLineItem()]);
  const [lineItemErrors, setLineItemErrors] = useState<LineItemDraftErrors[]>([]);
  const [formError, setFormError] = useState<FormattedApiError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const rowErrors = lineItems.map(validateLineItem);
    setLineItemErrors(rowErrors);
    const hasLineItemErrors = rowErrors.some((errors) => Object.keys(errors).length > 0);
    if (hasLineItemErrors) {
      return;
    }

    const formData = new FormData(e.currentTarget);
    const customer = String(formData.get("customer") ?? "");
    const dueDate = String(formData.get("dueDate") ?? "");

    setIsSubmitting(true);
    try {
      const res = await ordersApi.create({
        customer,
        dueDate,
        lineItems: lineItems.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
        })),
      });
      router.push(`/orders/view?id=${res.data.id}`);
    } catch (err) {
      const formatted = formatApiError(err, "Unable to create the order. Please try again.");
      setFormError(formatted);
      // Server may reject the whole lineItems array — surface as a form banner + keep row errors clear.
      const lineItemsMsg = firstFieldMessage(formatted.fieldErrors, "lineItems");
      if (lineItemsMsg) {
        setLineItemErrors([{ description: lineItemsMsg }]);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const customerError = formError ? firstFieldMessage(formError.fieldErrors, "customer") : undefined;
  const dueDateError = formError ? firstFieldMessage(formError.fieldErrors, "dueDate") : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-lg font-semibold text-zinc-900">New order</h1>
      <Card>
        <Card.Content>
          <Form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField isRequired name="customer" isInvalid={Boolean(customerError)}>
                <Label>Customer</Label>
                <Input placeholder="Acme Corp" />
                <FieldError>{customerError}</FieldError>
              </TextField>

              <TextField
                isRequired
                name="dueDate"
                type="date"
                defaultValue={defaultDueDate()}
                isInvalid={Boolean(dueDateError)}
              >
                <Label>Due date</Label>
                <Input />
                <FieldError>{dueDateError}</FieldError>
              </TextField>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-zinc-900">Line items</p>
              <OrderLineItemsEditor lineItems={lineItems} errors={lineItemErrors} onChange={setLineItems} />
            </div>

            <FormErrorBanner error={formError} showFieldList={false} />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" onPress={() => router.push("/dashboard")}>
                Cancel
              </Button>
              <Button type="submit" isPending={isSubmitting}>
                Create order
              </Button>
            </div>
          </Form>
        </Card.Content>
      </Card>
    </div>
  );
}

export default function NewOrderPage() {
  return (
    <AuthGuard>
      <NewOrderContent />
    </AuthGuard>
  );
}

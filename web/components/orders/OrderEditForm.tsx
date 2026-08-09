"use client";

/**
 * Editing an order: customer and due date are always editable metadata.
 * Line items, quantities, and unit prices become immutable once the order
 * has any payment recorded (order.isEditable is false) - see
 * docs/implementation-plan.md section 14. The backend enforces this
 * independently; this form just avoids offering an edit the API would reject.
 */
import { useState } from "react";
import { Button, Card, FieldError, Form, Input, Label, TextField } from "@heroui/react";
import { OrderLineItemsEditor } from "./OrderLineItemsEditor";
import { FormErrorBanner } from "@/components/ui/FormErrorBanner";
import { firstFieldMessage, formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { ordersApi } from "@/lib/api/orders";
import { validateLineItem, type LineItemDraft, type LineItemDraftErrors } from "@/lib/validation/orderForm";
import type { Order } from "@/lib/api/types";

interface Props {
  order: Order;
  onSaved: () => void;
  onCancel: () => void;
}

function toDrafts(order: Order): LineItemDraft[] {
  return (order.lineItems ?? []).map((item) => ({
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice),
  }));
}

export function OrderEditForm({ order, onSaved, onCancel }: Props) {
  const [lineItems, setLineItems] = useState<LineItemDraft[]>(toDrafts(order));
  const [lineItemErrors, setLineItemErrors] = useState<LineItemDraftErrors[]>([]);
  const [formError, setFormError] = useState<FormattedApiError | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    if (order.isEditable) {
      const rowErrors = lineItems.map(validateLineItem);
      setLineItemErrors(rowErrors);
      if (rowErrors.some((errors) => Object.keys(errors).length > 0)) {
        return;
      }
    }

    const formData = new FormData(e.currentTarget);
    const customer = String(formData.get("customer") ?? "");
    const dueDate = String(formData.get("dueDate") ?? "");

    setIsSubmitting(true);
    try {
      await ordersApi.update(order.id, {
        customer,
        dueDate,
        ...(order.isEditable
          ? {
              lineItems: lineItems.map((item) => ({
                description: item.description,
                quantity: Number(item.quantity),
                unitPrice: Number(item.unitPrice),
              })),
            }
          : {}),
      });
      onSaved();
    } catch (err) {
      const formatted = formatApiError(err, "Unable to save changes. Please try again.");
      setFormError(formatted);
      const lineItemsMsg = firstFieldMessage(formatted.fieldErrors, "lineItems");
      if (lineItemsMsg && order.isEditable) {
        setLineItemErrors([{ description: lineItemsMsg }]);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const customerError = formError ? firstFieldMessage(formError.fieldErrors, "customer") : undefined;
  const dueDateError = formError ? firstFieldMessage(formError.fieldErrors, "dueDate") : undefined;

  return (
    <Card>
      <Card.Content>
        <Form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              isRequired
              name="customer"
              defaultValue={order.customer}
              isInvalid={Boolean(customerError)}
            >
              <Label>Customer</Label>
              <Input />
              <FieldError>{customerError}</FieldError>
            </TextField>

            <TextField
              isRequired
              name="dueDate"
              type="date"
              defaultValue={order.dueDate.slice(0, 10)}
              isInvalid={Boolean(dueDateError)}
            >
              <Label>Due date</Label>
              <Input />
              <FieldError>{dueDateError}</FieldError>
            </TextField>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-zinc-900">Line items</p>
            {order.isEditable ? (
              <OrderLineItemsEditor lineItems={lineItems} errors={lineItemErrors} onChange={setLineItems} />
            ) : (
              <p className="text-sm text-zinc-500">
                This order has at least one payment recorded, so its line items can no longer be changed.
              </p>
            )}
          </div>

          <FormErrorBanner error={formError} showFieldList={false} />

          <div className="flex justify-end gap-2">
            <Button type="button" variant="tertiary" onPress={onCancel}>
              Cancel
            </Button>
            <Button type="submit" isPending={isSubmitting}>
              Save changes
            </Button>
          </div>
        </Form>
      </Card.Content>
    </Card>
  );
}

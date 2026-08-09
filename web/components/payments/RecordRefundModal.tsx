"use client";

/**
 * Refund recording flow: mirrors RecordPaymentModal, but the ceiling is the
 * order's current paid amount (not remaining due). The NumberField is not
 * clamped with maxValue — over-paid amounts are rejected in submit / by the
 * API so the user sees a clear error instead of a silent clamp.
 */
import { useState } from "react";
import { Button, FieldError, Form, Input, Label, Modal, NumberField, TextField } from "@heroui/react";
import { FormErrorBanner } from "@/components/ui/FormErrorBanner";
import { firstFieldMessage, formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { refundsApi } from "@/lib/api/refunds";
import { formatCurrency, toDateInputValue } from "@/lib/format";

interface Props {
  orderId: string;
  amountPaid: number;
  onRecorded: () => void;
}

export function RecordRefundModal({ orderId, amountPaid, onRecorded }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState<FormattedApiError | string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open) {
      setFormError(null);
      // Fresh key per open session — retries within the same open modal keep
      // the same key so a timeout + resubmit cannot double-refund.
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get("amount"));
    const refundDate = String(formData.get("refundDate") ?? "");
    const note = String(formData.get("note") ?? "").trim();

    if (!Number.isFinite(amount) || amount < 0.01) {
      setFormError("Enter an amount of at least $0.01.");
      return;
    }
    if (amount > amountPaid) {
      setFormError(`Maximum refund allowed is ${formatCurrency(amountPaid)}. Refresh the order if the paid amount looks wrong.`);
      return;
    }
    if (!refundDate) {
      setFormError("Refund date is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await refundsApi.record(orderId, { amount, refundDate, note: note || undefined }, idempotencyKey);
      setIsOpen(false);
      onRecorded();
    } catch (err) {
      setFormError(formatApiError(err, "Unable to record refund. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const structured = typeof formError === "object" && formError ? formError : null;
  const amountError = structured ? firstFieldMessage(structured.fieldErrors, "amount") : undefined;
  const dateError = structured ? firstFieldMessage(structured.fieldErrors, "refundDate") : undefined;
  const noteError = structured ? firstFieldMessage(structured.fieldErrors, "note") : undefined;

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button isDisabled={amountPaid <= 0}>Record refund</Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Record refund</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="mb-4 text-sm text-zinc-500">
                Amount paid: <span className="font-medium text-zinc-900">{formatCurrency(amountPaid)}</span>
              </p>
              <Form id="record-refund-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <NumberField
                  isRequired
                  name="amount"
                  minValue={0.01}
                  step={0.01}
                  formatOptions={{ style: "currency", currency: "USD" }}
                  defaultValue={amountPaid}
                  isInvalid={Boolean(amountError)}
                >
                  <Label>Amount</Label>
                  <NumberField.Group>
                    <NumberField.DecrementButton />
                    <NumberField.Input />
                    <NumberField.IncrementButton />
                  </NumberField.Group>
                  <FieldError>{amountError}</FieldError>
                </NumberField>

                <TextField
                  isRequired
                  name="refundDate"
                  type="date"
                  defaultValue={toDateInputValue(new Date())}
                  isInvalid={Boolean(dateError)}
                >
                  <Label>Refund date</Label>
                  <Input />
                  <FieldError>{dateError}</FieldError>
                </TextField>

                <TextField name="note" isInvalid={Boolean(noteError)}>
                  <Label>Note (optional)</Label>
                  <Input placeholder="e.g. customer returned goods" />
                  <FieldError>{noteError}</FieldError>
                </TextField>

                <FormErrorBanner error={formError} showFieldList={false} />
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" slot="close">
                Cancel
              </Button>
              <Button type="submit" form="record-refund-form" isPending={isSubmitting}>
                Submit refund
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

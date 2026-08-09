"use client";

/**
 * Payment recording flow: shows the current balance and blocks invalid
 * amounts client-side for UX (min $0.01, not above remaining due) without
 * clamping the NumberField. The server remains the source of truth — if
 * the balance changed since the page loaded (e.g. another payment landed),
 * the API's error message is shown as-is.
 */
import { useState } from "react";
import { Button, FieldError, Form, Input, Label, Modal, NumberField, TextField } from "@heroui/react";
import { FormErrorBanner } from "@/components/ui/FormErrorBanner";
import { firstFieldMessage, formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { paymentsApi } from "@/lib/api/payments";
import { formatCurrency, toDateInputValue } from "@/lib/format";

interface Props {
  orderId: string;
  remainingDue: number;
  onRecorded: () => void;
}

export function RecordPaymentModal({ orderId, remainingDue, onRecorded }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [formError, setFormError] = useState<FormattedApiError | string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (open) {
      setFormError(null);
      // A fresh idempotency key per "session" of opening the form - if the
      // user's request times out and they resubmit within the SAME open
      // modal, the key stays the same so a retry can't double-charge.
      setIdempotencyKey(crypto.randomUUID());
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get("amount"));
    const paymentDate = String(formData.get("paymentDate") ?? "");
    const note = String(formData.get("note") ?? "").trim();

    if (!Number.isFinite(amount) || amount < 0.01) {
      setFormError("Enter an amount of at least $0.01.");
      return;
    }
    if (amount > remainingDue) {
      setFormError(`Maximum payment allowed is ${formatCurrency(remainingDue)}. Refresh the order if the balance looks wrong.`);
      return;
    }
    if (!paymentDate) {
      setFormError("Payment date is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      await paymentsApi.record(orderId, { amount, paymentDate, note: note || undefined }, idempotencyKey);
      setIsOpen(false);
      onRecorded();
    } catch (err) {
      // The server enforces the same remaining-balance rule independently,
      // so if it rejects the payment we surface its exact message + hint.
      setFormError(formatApiError(err, "Unable to record payment. Please try again."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const structured = typeof formError === "object" && formError ? formError : null;
  const amountError = structured ? firstFieldMessage(structured.fieldErrors, "amount") : undefined;
  const dateError = structured ? firstFieldMessage(structured.fieldErrors, "paymentDate") : undefined;
  const noteError = structured ? firstFieldMessage(structured.fieldErrors, "note") : undefined;

  return (
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Button isDisabled={remainingDue <= 0}>Record payment</Button>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-md">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Record payment</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="mb-4 text-sm text-zinc-500">
                Current balance: <span className="font-medium text-zinc-900">{formatCurrency(remainingDue)}</span>
              </p>
              <Form id="record-payment-form" className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <NumberField
                  isRequired
                  name="amount"
                  minValue={0.01}
                  step={0.01}
                  formatOptions={{ style: "currency", currency: "USD" }}
                  defaultValue={remainingDue}
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
                  name="paymentDate"
                  type="date"
                  defaultValue={toDateInputValue(new Date())}
                  isInvalid={Boolean(dateError)}
                >
                  <Label>Payment date</Label>
                  <Input />
                  <FieldError>{dateError}</FieldError>
                </TextField>

                <TextField name="note" isInvalid={Boolean(noteError)}>
                  <Label>Note (optional)</Label>
                  <Input placeholder="e.g. wire transfer reference" />
                  <FieldError>{noteError}</FieldError>
                </TextField>

                <FormErrorBanner error={formError} showFieldList={false} />
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" slot="close">
                Cancel
              </Button>
              <Button type="submit" form="record-payment-form" isPending={isSubmitting}>
                Submit payment
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

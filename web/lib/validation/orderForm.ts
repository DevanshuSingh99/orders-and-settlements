/**
 * Client-side validation mirroring the server's rules (see
 * services/orders-service/src/modules/orders/schemas.ts), so the user sees
 * an error immediately instead of waiting for a round trip. The server
 * re-validates everything regardless - this is a UX convenience only.
 */
export interface LineItemDraft {
  description: string;
  quantity: string;
  unitPrice: string;
}

export interface LineItemDraftErrors {
  description?: string;
  quantity?: string;
  unitPrice?: string;
}

export function emptyLineItem(): LineItemDraft {
  return { description: "", quantity: "1", unitPrice: "" };
}

export function validateLineItem(item: LineItemDraft): LineItemDraftErrors {
  const errors: LineItemDraftErrors = {};

  if (!item.description.trim()) {
    errors.description = "Description is required.";
  }

  const quantity = Number(item.quantity);
  if (!item.quantity || Number.isNaN(quantity) || !Number.isInteger(quantity) || quantity < 1) {
    errors.quantity = "Quantity must be a whole number of at least 1.";
  }

  const unitPrice = Number(item.unitPrice);
  if (item.unitPrice === "" || Number.isNaN(unitPrice)) {
    errors.unitPrice = "Unit price is required.";
  } else if (unitPrice < 0) {
    errors.unitPrice = "Unit price cannot be negative.";
  } else if (!/^\d+(\.\d{1,2})?$/.test(item.unitPrice.trim())) {
    errors.unitPrice = "Unit price must have at most 2 decimal places.";
  }

  return errors;
}

export function lineItemTotal(item: LineItemDraft): number {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unitPrice);
  if (Number.isNaN(quantity) || Number.isNaN(unitPrice)) {
    return 0;
  }
  return quantity * unitPrice;
}

"use client";

/**
 * A repeating row editor for order line items. Uses plain styled <input>
 * elements rather than a full HeroUI form field per cell - with three
 * fields repeated across many rows, this stays far easier to read than
 * nesting nine compound components per row, and validation/error display
 * is simple parallel-array state.
 */
import { Button } from "@heroui/react";
import { formatCurrency } from "@/lib/format";
import { emptyLineItem, lineItemTotal, type LineItemDraft, type LineItemDraftErrors } from "@/lib/validation/orderForm";

const inputClass =
  "w-full rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none";
const invalidInputClass = "border-red-400 focus:border-red-500";

interface Props {
  lineItems: LineItemDraft[];
  errors: LineItemDraftErrors[];
  onChange: (lineItems: LineItemDraft[]) => void;
}

export function OrderLineItemsEditor({ lineItems, errors, onChange }: Props) {
  function updateItem(index: number, patch: Partial<LineItemDraft>) {
    onChange(lineItems.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function addItem() {
    onChange([...lineItems, emptyLineItem()]);
  }

  function removeItem(index: number) {
    onChange(lineItems.filter((_, i) => i !== index));
  }

  const orderTotal = lineItems.reduce((sum, item) => sum + lineItemTotal(item), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[1fr_90px_120px_110px_32px] gap-2 text-xs font-medium text-zinc-500">
        <span>Description</span>
        <span>Quantity</span>
        <span>Unit price</span>
        <span>Line total</span>
        <span />
      </div>

      {lineItems.map((item, index) => {
        const rowErrors = errors[index] ?? {};
        return (
          <div key={index} className="grid grid-cols-[1fr_90px_120px_110px_32px] items-start gap-2">
            <div>
              <input
                className={`${inputClass} ${rowErrors.description ? invalidInputClass : ""}`}
                value={item.description}
                placeholder="Item name"
                onChange={(e) => updateItem(index, { description: e.target.value })}
              />
              {rowErrors.description ? <p className="mt-1 text-xs text-red-600">{rowErrors.description}</p> : null}
            </div>
            <div>
              <input
                className={`${inputClass} ${rowErrors.quantity ? invalidInputClass : ""}`}
                type="number"
                min={1}
                step={1}
                value={item.quantity}
                onChange={(e) => updateItem(index, { quantity: e.target.value })}
              />
              {rowErrors.quantity ? <p className="mt-1 text-xs text-red-600">{rowErrors.quantity}</p> : null}
            </div>
            <div>
              <input
                className={`${inputClass} ${rowErrors.unitPrice ? invalidInputClass : ""}`}
                type="number"
                min={0}
                step="0.01"
                value={item.unitPrice}
                placeholder="0.00"
                onChange={(e) => updateItem(index, { unitPrice: e.target.value })}
              />
              {rowErrors.unitPrice ? <p className="mt-1 text-xs text-red-600">{rowErrors.unitPrice}</p> : null}
            </div>
            <div className="py-1.5 text-sm text-zinc-700">{formatCurrency(lineItemTotal(item))}</div>
            <button
              type="button"
              aria-label="Remove line item"
              className="py-1.5 text-zinc-400 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={lineItems.length === 1}
              onClick={() => removeItem(index)}
            >
              &times;
            </button>
          </div>
        );
      })}

      <div className="flex items-center justify-between pt-2">
        <Button type="button" variant="outline" size="sm" onPress={addItem}>
          Add line item
        </Button>
        <p className="text-sm font-medium text-zinc-900">Order total: {formatCurrency(orderTotal)}</p>
      </div>
    </div>
  );
}

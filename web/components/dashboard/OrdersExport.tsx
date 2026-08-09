"use client";

import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { downloadOrdersCsv } from "@/lib/api/exportOrders";
import type { OrderSort } from "@/lib/api/orders";
import { FormErrorBanner } from "@/components/ui/FormErrorBanner";
import { formatApiError, type FormattedApiError } from "@/lib/api/errors";
import { toDateInputValue } from "@/lib/format";
import type { OrderStatus } from "@/lib/api/types";

function defaultFromDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 30);
  return toDateInputValue(d);
}

function defaultToDate(): string {
  return toDateInputValue(new Date());
}

interface Props {
  status: OrderStatus | "all";
  search: string;
  sort: OrderSort;
}

export function OrdersExport({ status, search, sort }: Props) {
  const [dueDateFrom, setDueDateFrom] = useState(defaultFromDate);
  const [dueDateTo, setDueDateTo] = useState(defaultToDate);
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<FormattedApiError | string | null>(null);

  async function handleExport() {
    setError(null);
    if (!dueDateFrom || !dueDateTo) {
      setError("Choose both a from and to due date.");
      return;
    }
    if (dueDateFrom > dueDateTo) {
      setError("From date must be on or before the to date.");
      return;
    }

    setIsExporting(true);
    setProgress("Exporting…");
    try {
      await downloadOrdersCsv({
        dueDateFrom,
        dueDateTo,
        ...(status === "all" ? {} : { status }),
        ...(search ? { search } : {}),
        sort,
        onProgress: (exported, total) => {
          if (total === 0) {
            setProgress("Exporting… (no matching orders)");
            return;
          }
          setProgress(`Exporting… (${exported.toLocaleString()} of ${total.toLocaleString()})`);
        },
      });
      setProgress(null);
    } catch (err) {
      setError(formatApiError(err, "Unable to export orders. Please try again."));
      setProgress(null);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <TextField className="w-36" type="date" value={dueDateFrom} onChange={setDueDateFrom}>
          <Label>Due from</Label>
          <Input />
        </TextField>
        <TextField className="w-36" type="date" value={dueDateTo} onChange={setDueDateTo}>
          <Label>Due to</Label>
          <Input />
        </TextField>
        <Button onPress={handleExport} isDisabled={isExporting}>
          {isExporting ? progress ?? "Exporting…" : "Export CSV"}
        </Button>
      </div>
      <FormErrorBanner error={error} />
    </div>
  );
}

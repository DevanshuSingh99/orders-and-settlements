import { Button } from "@heroui/react";
import { ORDER_STATUS_OPTIONS } from "@/components/ui/StatusChip";
import type { OrderStatus } from "@/lib/api/types";

/**
 * A simple toggle-button row instead of a dropdown - with only five
 * options, every choice is visible at once and one click switches
 * filters, which is faster than opening a Select for this use case.
 */
export function StatusFilterBar({
  value,
  onChange,
}: {
  value: OrderStatus | "all";
  onChange: (status: OrderStatus | "all") => void;
}) {
  const options: { value: OrderStatus | "all"; label: string }[] = [
    { value: "all", label: "All" },
    ...ORDER_STATUS_OPTIONS,
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          size="sm"
          variant={value === option.value ? "primary" : "outline"}
          onPress={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

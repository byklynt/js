"use client";

import { presetAmounts } from "@/lib/payments-data";
import { formatIdr } from "@/lib/balance";
import { SegmentedControl, type SegmentedItem } from "@/components/ui/segmented-control";

export type PresetValue = number | "custom" | null;

export function AmountPresets({
  value,
  onSelect,
}: {
  value: PresetValue;
  onSelect: (next: number | "custom") => void;
}) {
  const items: SegmentedItem<number | "custom">[] = [
    ...presetAmounts.map((a) => ({ value: a as number, label: formatIdr(a) })),
    { value: "custom", label: "Custom" },
  ];

  return (
    <SegmentedControl<number | "custom">
      items={items}
      value={value}
      onChange={onSelect}
      ariaLabel="Pilih nominal"
    />
  );
}

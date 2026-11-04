"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import type { RefillRequest } from "@/lib/refills-data";
import { RecordCard } from "@/components/ui/record-card";
import { ChipBody, CopyLinkChip, chipClass, chipFocusClass } from "@/components/ui/info-chip";
import { RefillStatusChip } from "./refill-status-chip";

export function RefillCard({
  refill,
  index,
  selected,
  onToggleSelect,
  onReport,
}: {
  refill: RefillRequest;
  index: number;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onReport: (refill: RefillRequest) => void;
}) {
  return (
    <RecordCard
      index={index}
      platform={refill.platform}
      idLabel={`ID: ${refill.id}`}
      checkboxLabel={`Pilih refill ${refill.id}`}
      selected={selected}
      onToggleSelect={() => onToggleSelect(refill.id)}
      name={refill.name}
      dateIso={refill.createdAt}
      status={<RefillStatusChip status={refill.status} />}
      onReport={() => onReport(refill)}
    >
      <Link
        href={`/dashboard/orders?search=${refill.orderId}`}
        aria-label={`Lihat pesanan ${refill.orderId}`}
        className={`${chipClass} ${chipFocusClass}`}
      >
        <ChipBody icon={FileText}>Pesanan: {refill.orderId}</ChipBody>
      </Link>
      <CopyLinkChip link={refill.link} />
    </RecordCard>
  );
}

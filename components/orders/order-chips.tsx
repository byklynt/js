"use client";

import { CircleDollarSign, Gauge, Hourglass, ListOrdered } from "lucide-react";
import type { Order } from "@/lib/orders-data";
import { formatIdr } from "@/lib/balance";
import { CopyLinkChip, InfoChip } from "@/components/ui/info-chip";

export function OrderChips({ order }: { order: Order }) {
  return (
    <>
      <CopyLinkChip link={order.link} />
      <InfoChip icon={CircleDollarSign}>Biaya: {formatIdr(order.charge)}</InfoChip>
      <InfoChip icon={ListOrdered}>Jumlah: {order.quantity.toLocaleString("id-ID")}</InfoChip>
      <InfoChip icon={Gauge}>Awal: {order.startCount.toLocaleString("id-ID")}</InfoChip>
      <InfoChip icon={Hourglass}>Sisa: {order.remains.toLocaleString("id-ID")}</InfoChip>
    </>
  );
}

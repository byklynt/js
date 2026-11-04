"use client";

import { Check, Loader2, RefreshCcw, Undo2 } from "lucide-react";
import { CancelRequestButton } from "./cancel-request-button";
import type { MyOrder } from "@/lib/user-actions";
import { formatIdr } from "@/lib/balance";
import { InfoChip } from "@/components/ui/info-chip";
import { RecordCard } from "@/components/ui/record-card";
import { OrderStatusChip } from "./order-status-chip";
import { OrderChips } from "./order-chips";

export type RefillState = "idle" | "loading" | "done";

export function OrderCard({
  order,
  index,
  selected,
  onToggleSelect,
  refillState,
  onRefill,
  onCancel,
  onReport,
}: {
  order: MyOrder;
  index: number;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  refillState: RefillState;
  onRefill: (order: MyOrder) => void;
  onCancel: (order: MyOrder) => void;
  onReport: (order: MyOrder) => void;
}) {
  const canRefill = order.status === "selesai" && order.refillable;

  return (
    <RecordCard
      index={index}
      platform={order.platform}
      idLabel={`ID: ${order.id}`}
      checkboxLabel={`Pilih pesanan ${order.id}`}
      selected={selected}
      onToggleSelect={() => onToggleSelect(order.id)}
      name={order.name}
      dateIso={order.createdAt}
      status={<OrderStatusChip status={order.status} />}
      onReport={() => onReport(order)}
    >
      <OrderChips order={order} />
      {order.refunded > 0 ? <InfoChip icon={Undo2}>Refund: {formatIdr(order.refunded)}</InfoChip> : null}
      <CancelRequestButton order={order} onRequest={onCancel} />
      {canRefill ? (
        <button
          type="button"
          disabled={refillState !== "idle" || !order.refill.allowed}
          title={order.refill.allowed ? undefined : (order.refill.reason ?? undefined)}
          onClick={() => onRefill(order)}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-[10px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-70 md:ml-auto md:w-auto dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
        >
          {refillState === "loading" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : refillState === "done" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          {refillState === "done" ? "Refill diajukan" : "Refill"}
        </button>
      ) : null}
    </RecordCard>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Clock, X } from "lucide-react";
import type { MyOrder } from "@/lib/user-actions";
import { formatCountdown, msUntil } from "@/lib/order-rules";
import { formatDateTime } from "@/lib/balance";

/**
 * "Ajukan pembatalan". Enabled once the order is old enough. Before that it is disabled and says when it opens,
 * with a live countdown. Hidden when the service cannot be cancelled, the order is finished, or a request is open.
 */
export function CancelRequestButton({ order, onRequest }: { order: MyOrder; onRequest: (o: MyOrder) => void }) {
  const availableAt = order.cancel.availableAt;
  const [now, setNow] = useState(() => Date.now());

  // Tick every second in the last hour, otherwise every 30 seconds.
  useEffect(() => {
    if (!availableAt) return;
    const left = msUntil(availableAt, now);
    if (left === 0) return;
    const timer = window.setTimeout(() => setNow(Date.now()), left < 3_600_000 ? 1000 : 30_000);
    return () => window.clearTimeout(timer);
  }, [availableAt, now]);

  const waiting = Boolean(availableAt) && msUntil(availableAt as string, now) > 0;
  const canAsk = order.cancel.allowed || (Boolean(availableAt) && !waiting && !order.cancel.reason?.includes("diproses"));
  if (!order.cancel.allowed && !(waiting && availableAt)) return null;

  const base =
    "flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-4 text-[10px] font-medium text-ink transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 md:w-auto";

  if (waiting && availableAt) {
    const label = `Bisa diajukan setelah ${formatDateTime(availableAt)}`;
    return (
      <div className="flex flex-col items-stretch gap-1 md:ml-auto md:items-end">
        <button type="button" disabled aria-disabled="true" title={label} className={`${base} cursor-not-allowed opacity-60`}>
          <X className="h-3.5 w-3.5" aria-hidden />
          Ajukan pembatalan
        </button>
        <p className="flex items-center gap-1 text-[9px] text-[#5B6B8C] dark:text-slate-400" data-testid="cancel-countdown">
          <Clock className="h-3 w-3" aria-hidden />
          {label} ({formatCountdown(msUntil(availableAt, now))} lagi)
        </p>
      </div>
    );
  }

  return (
    <button type="button" disabled={!canAsk} onClick={() => onRequest(order)} className={`${base} hover:bg-slate-50 md:ml-auto dark:hover:bg-slate-800`}>
      <X className="h-3.5 w-3.5" aria-hidden />
      Ajukan pembatalan
    </button>
  );
}

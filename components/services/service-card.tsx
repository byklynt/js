"use client";

import { chooseEstimate } from "@/lib/service-estimate";
import { memo, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Clock, Gauge, RefreshCw, Heart, MessageSquare, ShoppingCart, X } from "lucide-react";
import type { ServiceDetailData, ServiceRow } from "@/lib/services-types";
import { formatRupiah, formatPricePer1000 } from "@/lib/dashboard-data";
import { formatMaxQty } from "@/lib/service-format";
import { fetchServiceDetail, isAbort } from "@/lib/services-client";
import { cn } from "@/lib/utils";
import { ServiceDescription } from "./service-description";

function formatSpeed(speedPerHour: number): string {
  return speedPerHour >= 1000 ? `${Math.round(speedPerHour / 1000)}K/jam` : `${speedPerHour}/jam`;
}

/** The long description is fetched only when "Deskripsi" is opened. */
function Description({ service }: { service: ServiceRow }) {
  const [state, setState] = useState<{ id: string; detail: ServiceDetailData | null; error: boolean } | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchServiceDetail(service.id, ctrl.signal)
      .then((detail) => setState({ id: service.id, detail, error: false }))
      .catch((e) => {
        if (!isAbort(e)) setState({ id: service.id, detail: null, error: true });
      });
    return () => ctrl.abort();
  }, [service.id]);
  const mine = state?.id === service.id ? state : null;
  if (!mine) return <p role="status" className="text-[10.5px] text-slate-400">Memuat deskripsi...</p>;
  if (mine.error || !mine.detail) return <p className="text-[10.5px] text-red-500">Deskripsi gagal dimuat.</p>;
  return <ServiceDescription lines={mine.detail.description} />;
}

function DescriptionModal({ service, onClose }: { service: ServiceRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Deskripsi ${service.name}`}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-ink dark:text-white">{service.name}</p>
          <button
            type="button"
            aria-label="Tutup deskripsi"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Description service={service} />
      </div>
    </div>
  );
}

type Props = {
  service: ServiceRow;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  isExpanded: boolean;
  onToggleExpanded: (id: string) => void;
  isMobile: boolean;
};

/** Memoized: re-renders only when its own row or its favorite/expanded booleans change. Callbacks must be stable. */
export const ServiceCard = memo(function ServiceCard({ service, isFavorite, onToggleFavorite, isExpanded, onToggleExpanded, isMobile }: Props) {
  const hasTime = Boolean(service.avgTime);
  const hasSpeed = typeof service.speed === "number" && service.speed > 0;
  // Measured delivery time (median of the latest completed orders) or "Belum ada estimasi". Numbers come with the row: no extra request.
  const estimate = chooseEstimate(service.est);

  return (
    <li className="service-card list-none overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1.5">
            <span className="shrink-0 rounded-full bg-primary-solid px-2.5 py-1 text-[9.5px] font-semibold text-white">
              ID: {service.id}
            </span>
            <span className="min-w-0 text-[10.5px] font-semibold text-ink dark:text-slate-100">{service.name}</span>
          </div>

          <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:justify-between">
            <div
              className="flex overflow-hidden rounded-lg border border-slate-200/70 text-[10.5px] font-semibold text-ink dark:border-slate-700 dark:text-slate-100"
              title={formatPricePer1000(service.price)}
            >
              <span className="px-2.5 py-1.5">{formatRupiah(service.price)}</span>
              <span className="border-l border-slate-200/70 px-2.5 py-1.5 dark:border-slate-700">1000</span>
            </div>
            <button
              type="button"
              aria-pressed={isFavorite}
              aria-label={isFavorite ? `Hapus ${service.name} dari favorit` : `Tambahkan ${service.name} ke favorit`}
              onClick={() => onToggleFavorite(service.id)}
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition",
                isFavorite
                  ? "border-primary bg-primary-solid text-white"
                  : "border-slate-200/70 text-slate-400 hover:border-primary-300 hover:text-primary-accent dark:border-slate-700 dark:text-slate-500"
              )}
            >
              <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
            </button>
          </div>
        </div>

        <div className="my-3 h-px w-full bg-slate-100 dark:bg-slate-800" />

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-lg border border-slate-200/70 text-[9.5px] font-semibold text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <span className="flex items-center gap-1 px-2.5 py-1.5">
                <ChevronDown className="h-3 w-3 text-slate-400" aria-hidden />
                Min: {service.min.toLocaleString("id-ID")}
              </span>
              <span className="flex items-center gap-1 border-l border-slate-200/70 px-2.5 py-1.5 dark:border-slate-700">
                <ChevronUp className="h-3 w-3 text-slate-400" aria-hidden />
                Maks: {formatMaxQty(service.max)}
              </span>
            </div>
            {hasTime ? (
              <span className="flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1.5 text-[9.5px] font-semibold text-primary-accent dark:bg-primary-950/40 dark:text-primary-300">
                <Clock className="h-3 w-3" />
                {service.avgTime}
              </span>
            ) : null}
            <span
              data-estimate
              data-testid="service-estimate"
              title={estimate.note ?? undefined}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[9.5px] font-semibold",
                estimate.kind === "none"
                  ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  : "bg-primary-50 text-primary-accent dark:bg-primary-950/40 dark:text-primary-300"
              )}
            >
              <Clock className="h-3 w-3" aria-hidden />
              {estimate.kind === "none" ? estimate.text : `Estimasi: ${estimate.text}`}
            </span>
            {hasSpeed ? (
              <span className="flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1.5 text-[9.5px] font-semibold text-primary-accent dark:bg-primary-950/40 dark:text-primary-300">
                <Gauge className="h-3 w-3" />
                {formatSpeed(service.speed as number)}
              </span>
            ) : null}
            {service.refillDays ? (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[9.5px] font-semibold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <RefreshCw className="h-3 w-3" />
                Refill: {service.refillDays} Hari
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-2 max-md:grid max-md:w-full max-md:grid-cols-2">
            <button
              type="button"
              aria-expanded={isExpanded}
              onClick={() => onToggleExpanded(service.id)}
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/70 bg-white px-3 text-[9.5px] font-semibold text-slate-600 transition hover:border-primary-300 hover:text-primary-accent dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Deskripsi
            </button>
            <Link
              href={`/dashboard?service=${service.id}`}
              className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-3 text-[9.5px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105"
            >
              <ShoppingCart className="h-3.5 w-3.5" />
              Beli Sekarang
            </Link>
          </div>
        </div>
      </div>

      {isExpanded && !isMobile ? (
        <div className="fade-in border-t border-slate-200/70 p-4 dark:border-slate-800">
          <Description service={service} />
        </div>
      ) : null}
      {isExpanded && isMobile ? <DescriptionModal service={service} onClose={() => onToggleExpanded(service.id)} /> : null}
    </li>
  );
});

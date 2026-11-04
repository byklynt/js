"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ChevronDown, ChevronUp, Clock, Gauge, RefreshCw, Heart, MessageSquare, ShoppingCart, X } from "lucide-react";
import type { Service } from "@/lib/dashboard-data";
import { formatRupiah, formatPricePer1000, getBadgeEmoji } from "@/lib/dashboard-data";
import { cn } from "@/lib/utils";
import { ServiceDescription } from "./service-description";
import { useMediaQuery } from "@/lib/use-media-query";

function formatSpeed(speedPerHour: number): string {
  // Imported services have no speed figure from the provider.
  if (speedPerHour <= 0) return "Bervariasi";
  return speedPerHour >= 1000 ? `${Math.round(speedPerHour / 1000)}K/jam` : `${speedPerHour}/jam`;
}

function ServiceDescriptionModal({ service, onClose }: { service: Service; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
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
        <ServiceDescription service={service} />
      </motion.div>
    </div>
  );
}

export function ServiceCard({
  service,
  index,
  isFavorite,
  onToggleFavorite,
  isExpanded,
  onToggleExpanded,
}: {
  service: Service;
  index: number;
  isFavorite: boolean;
  onToggleFavorite: (id: string) => void;
  isExpanded: boolean;
  onToggleExpanded: (id: string) => void;
}) {
  const isMobile = useMediaQuery("(max-width: 767px)");

  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.03, ease: "easeOut" }}
      className="list-none overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1.5">
            <span className="shrink-0 rounded-full bg-primary-solid px-2.5 py-1 text-[9.5px] font-semibold text-white">
              ID: {service.id}
            </span>
            <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[10.5px] font-semibold text-ink dark:text-slate-100">
              <span>{service.name}</span>
              {service.badges.map((badge) => (
                <span
                  key={badge}
                  className="flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400"
                >
                  <span aria-hidden className="text-slate-300 dark:text-slate-600">
                    |
                  </span>
                  <span aria-hidden>{getBadgeEmoji(badge)}</span>
                  {badge}
                </span>
              ))}
              <span className="flex items-center gap-1 font-medium text-slate-500 dark:text-slate-400">
                <span aria-hidden className="text-slate-300 dark:text-slate-600">
                  -
                </span>
                {formatPricePer1000(service.pricePer1000)}
              </span>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2 max-md:w-full max-md:justify-between">
            <div className="flex overflow-hidden rounded-lg border border-slate-200/70 text-[10.5px] font-semibold text-ink dark:border-slate-700 dark:text-slate-100">
              <span className="px-2.5 py-1.5">{formatRupiah(service.pricePer1000)}</span>
              <span className="border-l border-slate-200/70 px-2.5 py-1.5 dark:border-slate-700">
                1000
              </span>
            </div>
            <button
              type="button"
              aria-pressed={isFavorite}
              aria-label={
                isFavorite
                  ? `Hapus ${service.name} dari favorit`
                  : `Tambahkan ${service.name} ke favorit`
              }
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
                Maks: {service.max.toLocaleString("id-ID")}
              </span>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1.5 text-[9.5px] font-semibold text-primary-accent dark:bg-primary-950/40 dark:text-primary-300">
              <Clock className="h-3 w-3" />
              {service.startTime}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-primary-50 px-2.5 py-1.5 text-[9.5px] font-semibold text-primary-accent dark:bg-primary-950/40 dark:text-primary-300">
              <Gauge className="h-3 w-3" />
              {formatSpeed(service.speedPerHour)}
            </span>
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

      <AnimatePresence initial={false}>
        {isExpanded && !isMobile ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden border-t border-slate-200/70 dark:border-slate-800"
          >
            <div className="p-4">
              <ServiceDescription service={service} />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isExpanded && isMobile ? (
          <ServiceDescriptionModal service={service} onClose={() => onToggleExpanded(service.id)} />
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

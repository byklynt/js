"use client";

import Link from "next/link";
import { CalendarDays, Megaphone } from "lucide-react";
import { motion } from "framer-motion";
import { platforms } from "@/lib/dashboard-data";
import type { ServiceUpdate } from "@/lib/updates-data";
import { UpdateTypeLabel } from "./update-type-label";

const levelPill = {
  info: "bg-primary-solid text-white",
  penting: "bg-amber-500 text-white",
  peringatan: "bg-red-500 text-white",
} as const;
const levelText = { info: "Info", penting: "Penting", peringatan: "Peringatan" } as const;

/** Same row style as a service update; the whole row opens the announcement in a modal (no external link). */
export function AnnouncementUpdateRow({ update, index, onOpen }: { update: ServiceUpdate; index: number; onOpen?: (u: ServiceUpdate) => void }) {
  const level = update.announcement?.level ?? "info";
  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.03, ease: "easeOut" }}
      className="relative list-none rounded-2xl border border-slate-200/70 bg-white transition hover:border-primary-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
    >
      <button
        type="button"
        onClick={() => onOpen?.(update)}
        aria-label={`Buka pengumuman: ${update.name}`}
        aria-haspopup="dialog"
        className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      <div className="pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 md:h-[54px] md:flex-nowrap md:py-0">
        <span className="order-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-accent">
          <Megaphone className="h-[17px] w-[17px]" aria-hidden />
        </span>
        <span className={`order-2 shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold ${levelPill[level]}`}>{levelText[level]}</span>
        <span title={update.name} className="order-4 line-clamp-2 w-full min-w-0 text-[11px] font-medium text-ink md:order-3 md:block md:w-auto md:truncate md:line-clamp-none dark:text-white">
          {update.name}
        </span>
        <time dateTime={update.date} className="order-3 flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-ink md:order-4 dark:text-slate-100">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {update.date}
        </time>
        <div className="pointer-events-auto order-5 md:ml-auto">
          <UpdateTypeLabel type="pengumuman" detail={update.detail} />
        </div>
      </div>
    </motion.li>
  );
}

export function UpdateRow({ update, index, onOpenAnnouncement }: { update: ServiceUpdate; index: number; onOpenAnnouncement?: (u: ServiceUpdate) => void }) {
  if (update.type === "pengumuman") return <AnnouncementUpdateRow update={update} index={index} onOpen={onOpenAnnouncement} />;
  const platform = platforms.find((p) => p.id === update.platform);

  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index, 10) * 0.03, ease: "easeOut" }}
      className="relative list-none rounded-2xl border border-slate-200/70 bg-white transition hover:border-primary-200 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600"
    >
      {/* Stretched link: the whole row is clickable while the tooltip button stays reachable above it. */}
      <Link
        href={`/dashboard/services?search=${update.serviceId}`}
        aria-label={`Lihat layanan ${update.serviceId}: ${update.name}`}
        className="absolute inset-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      />
      <div className="pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 md:h-[54px] md:flex-nowrap md:py-0">
        <span className="order-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary-accent">
          {platform ? <platform.icon className="h-[17px] w-[17px]" /> : null}
        </span>
        <span className="order-2 shrink-0 rounded-full bg-primary-solid px-3 py-1.5 text-[10px] font-semibold text-white">
          ID: {update.serviceId}
        </span>
        <span
          title={update.name}
          className="order-4 line-clamp-2 w-full min-w-0 text-[11px] font-medium text-ink md:order-3 md:block md:w-auto md:truncate md:line-clamp-none dark:text-white"
        >
          {update.name}
        </span>
        <time
          dateTime={update.date}
          className="order-3 flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-ink md:order-4 dark:text-slate-100"
        >
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {update.date}
        </time>
        <div className="pointer-events-auto order-5 md:ml-auto">
          <UpdateTypeLabel type={update.type} detail={update.detail} />
        </div>
      </div>
    </motion.li>
  );
}

"use client";

import { useMemo, useSyncExternalStore } from "react";
import Link from "next/link";
import { Megaphone, X } from "lucide-react";
import { motion } from "framer-motion";
import { levelLabels, type AnnouncementLevel, type PublicAnnouncement } from "@/lib/announcements-data";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { brand } from "@/lib/brand";
import { migrateLegacyStorage } from "@/lib/storage-migrate";

const tone: Record<AnnouncementLevel, { box: string; circle: string }> = {
  info: {
    box: "border-primary-200/80 bg-primary-soft dark:border-primary-border",
    circle: "bg-primary-soft text-primary-accent",
  },
  penting: {
    box: "border-amber-200/80 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
    circle: "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
  },
  peringatan: {
    box: "border-red-200/80 bg-red-50 dark:border-red-500/30 dark:bg-red-500/10",
    circle: "bg-red-100 text-red-500 dark:bg-red-500/20 dark:text-red-300",
  },
};

/** One announcement banner. Also used (unchanged) by the admin preview, so what admins see is what users get. */
export function AnnouncementBanner({ item, onDismiss, className }: { item: PublicAnnouncement; onDismiss?: () => void; className?: string }) {
  const t = tone[item.level];
  return (
    <article
      aria-label={`Pengumuman ${levelLabels[item.level]}: ${item.title}`}
      className={cn("flex items-start gap-3 rounded-2xl border px-3.5 py-3", t.box, className)}
    >
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", t.circle)}>
        <Megaphone className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] leading-snug font-semibold text-ink dark:text-white">{item.title}</p>
        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[#2B3A5C] dark:text-slate-300">{item.body}</p>
        <time dateTime={item.publishAt} className="mt-1 block text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
          {formatDate(item.publishAt)}
        </time>
      </div>
      {onDismiss ? (
        <button
          type="button"
          aria-label="Tutup pengumuman"
          onClick={onDismiss}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#5B6B8C] transition hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-slate-400 dark:hover:bg-white/10"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      ) : null}
    </article>
  );
}

const EVENT = "sg:announcements-dismissed";
const storageKey = (userKey: string) => `${brand.storagePrefix}:ann-dismissed:${userKey}`;

// Dismissals are remembered per user and per announcement id, together with the updated_at they were dismissed at.
// TODO(db): move to a server table `announcement_dismissals(user_id, announcement_id, updated_at)`.
function readRaw(userKey: string): string {
  try {
    migrateLegacyStorage();
    return window.localStorage.getItem(storageKey(userKey)) ?? "{}";
  } catch {
    return "{}";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

const MAX_VISIBLE = 2;

/** Compact banner stack for the top of /dashboard: at most 2, newest first, each one dismissible. */
export function AnnouncementBanners({ items, userKey }: { items: PublicAnnouncement[]; userKey: string }) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(userKey), () => "{}");
  const dismissed = useMemo<Record<string, string>>(() => {
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }, [raw]);

  // An edited announcement (new updatedAt) comes back even if it was dismissed before.
  const open = items.filter((a) => dismissed[a.id] !== a.updatedAt);
  if (open.length === 0) return null;

  function dismiss(a: PublicAnnouncement) {
    try {
      window.localStorage.setItem(storageKey(userKey), JSON.stringify({ ...dismissed, [a.id]: a.updatedAt }));
    } catch {
      /* storage blocked: the banner just stays until the next visit */
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <section aria-label="Pengumuman" className="space-y-2">
      <ul className="space-y-2">
        {open.slice(0, MAX_VISIBLE).map((a) => (
          <motion.li key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="list-none">
            <AnnouncementBanner item={a} onDismiss={() => dismiss(a)} />
          </motion.li>
        ))}
      </ul>
      <div className="flex justify-end">
        <Link href="/dashboard/updates" className="rounded text-[10px] font-medium text-primary-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Lihat semua
        </Link>
      </div>
    </section>
  );
}

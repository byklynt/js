"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BellOff } from "lucide-react";
import { formatUpdateGroupLabel, updates, type ServiceUpdate } from "@/lib/updates-data";
import { markUpdatesSeenAction } from "@/lib/announcement-actions";
import { refreshUpdatesBadge } from "@/lib/announcements-store";
import { formatDate } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { UpdatesToolbar, type TypeFilter } from "./updates-toolbar";
import { UpdateRow } from "./update-row";

const PAGE_SIZE = 12;

function UpdatesSkeleton() {
  return (
    <ul aria-busy="true" aria-label="Memuat pembaruan" className="space-y-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <li
          key={i}
          className="flex h-[54px] list-none items-center gap-3 rounded-2xl border border-slate-200/70 px-3 dark:border-slate-800"
        >
          <div className="animate-shimmer h-9 w-9 rounded-full" />
          <div className="animate-shimmer h-7 w-24 rounded-full" />
          <div className="animate-shimmer h-4 w-1/2 rounded-md" />
        </li>
      ))}
    </ul>
  );
}

export function UpdatesPage({ extra = [], announcements = [] }: { extra?: ServiceUpdate[]; announcements?: ServiceUpdate[] }) {
  const [openAnnouncement, setOpenAnnouncement] = useState<ServiceUpdate | null>(null);
  const [type, setType] = useState<TypeFilter>("semua");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [readyFor, setReadyFor] = useState<TypeFilter | null>(null);
  const [visible, setVisible] = useState(PAGE_SIZE);

  // Skeleton shimmer for 400ms on first load and whenever the type filter changes.
  const loading = readyFor !== type;
  useEffect(() => {
    const timer = window.setTimeout(() => setReadyFor(type), 400);
    return () => window.clearTimeout(timer);
  }, [type]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim().toLowerCase()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  // Opening the page counts as seeing the announcements: the sidebar badge clears.
  useEffect(() => {
    if (announcements.length === 0) return;
    void markUpdatesSeenAction().then(refreshUpdatesBadge).catch(() => {});
  }, [announcements.length]);

  const allUpdates = useMemo(
    () =>
      extra.length === 0 && announcements.length === 0
        ? updates
        : [...announcements, ...extra, ...updates].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [extra, announcements]
  );

  const filtered = useMemo(
    () =>
      allUpdates.filter((u) => {
        if (type !== "semua" && u.type !== type) return false;
        if (!debouncedQuery) return true;
        return (
          u.serviceId.includes(debouncedQuery) ||
          u.name.toLowerCase().includes(debouncedQuery) ||
          // announcements are searchable by their text too
          Boolean(u.announcement?.body.toLowerCase().includes(debouncedQuery))
        );
      }),
    [allUpdates, type, debouncedQuery]
  );
  const shown = filtered.slice(0, visible);

  return (
    <div>
      <HeaderZone />
      <PageHeading title="Pembaruan" subtitle="Lihat pembaruan terbaru layanan kami." />

      <div className="relative mt-[46px]">
        <HeaderLine top="50%" />
        <UpdatesToolbar
          type={type}
          onTypeChange={(next) => {
            setType(next);
            setVisible(PAGE_SIZE);
          }}
          query={query}
          onQueryChange={setQuery}
        />
      </div>

      <section aria-label="Daftar pembaruan" className="mt-5">
        {loading ? (
          <UpdatesSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-6 py-20 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary-accent shadow-sm dark:bg-slate-900">
              <BellOff className="h-6 w-6" />
            </span>
            <p className="mt-5 text-[11px] font-semibold text-ink dark:text-slate-200">
              Belum ada pembaruan
            </p>
            <Link
              href="/dashboard/services"
              className="mt-4 rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-4 py-2.5 text-[10.5px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105"
            >
              Lihat layanan
            </Link>
          </div>
        ) : (
          <>
            <ul className="space-y-3">
              {shown.map((u, i) => (
                <Fragment key={u.id}>
                  {i === 0 || shown[i - 1].date !== u.date ? (
                    <li
                      className="list-none pt-1 text-[10px] font-semibold tracking-wide text-[#5B6B8C] uppercase dark:text-slate-400"
                    >
                      {formatUpdateGroupLabel(u.date)}
                    </li>
                  ) : null}
                  <UpdateRow update={u} index={i} onOpenAnnouncement={setOpenAnnouncement} />
                </Fragment>
              ))}
            </ul>
            {filtered.length > visible ? (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisible((v) => v + PAGE_SIZE)}
                  className="h-9 rounded-xl border border-slate-200 px-5 text-[10px] font-medium text-ink transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Tampilkan lebih banyak
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>
      <Dialog
        open={Boolean(openAnnouncement)}
        onClose={() => setOpenAnnouncement(null)}
        title={openAnnouncement?.name ?? "Pengumuman"}
        description={openAnnouncement?.announcement ? formatDate(openAnnouncement.announcement.publishAt) : undefined}
        maxWidth="max-w-lg"
      >
        <p className="text-[11px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-ink dark:text-slate-200">{openAnnouncement?.announcement?.body}</p>
      </Dialog>
    </div>
  );
}

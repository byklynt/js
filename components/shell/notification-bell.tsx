"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, Bell, Headset, Info, Megaphone, ShoppingCart, Undo2, Wallet, type LucideIcon } from "lucide-react";
import { getUnreadCountAction, listNotificationsAction, markAllReadAction, markReadAction } from "@/lib/notification-actions";
import type { NotificationType, NotificationView } from "@/lib/notifications-data";
import { useLanguage } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export const NOTIFICATIONS_EVENT = "sg:notifications-refresh";
/** Ask every bell on the page to re-read the count (after something happened in this tab). */
export function refreshNotifications() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_EVENT));
}

/** TODO(realtime): replace polling with SSE / websocket. */
const POLL_MS = 30_000;

export const typeIcon: Record<NotificationType, LucideIcon> = {
  pesanan: ShoppingCart, refund: Undo2, deposit: Wallet, tiket: Headset, pembaruan: Activity, pengumuman: Megaphone, sistem: Info,
};
export const typeTint: Record<NotificationType, string> = {
  pesanan: "bg-primary-50 text-primary-600 dark:bg-primary-soft dark:text-primary-accent",
  refund: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  deposit: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
  tiket: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  pembaruan: "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300",
  pengumuman: "bg-primary-50 text-primary-600 dark:bg-primary-soft dark:text-primary-accent",
  sistem: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
};

/** "5 menit lalu" / "5 minutes ago" with Intl.RelativeTimeFormat. */
export function relativeTime(iso: string, locale: string, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.min(0, seconds), "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 2_592_000) return rtf.format(Math.round(seconds / 86_400), "day");
  return rtf.format(Math.round(seconds / 2_592_000), "month");
}

export function NotificationItemBody({ n, locale }: { n: NotificationView; locale: string }) {
  const Icon = typeIcon[n.type];
  return (
    <>
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full", typeTint[n.type])}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] leading-snug font-semibold text-ink dark:text-white">{n.title}</span>
        <span className="mt-0.5 line-clamp-2 block text-[10px] leading-snug text-[#5B6B8C] dark:text-slate-400">{n.body}</span>
        <time dateTime={n.createdAt} className="mt-1 block text-[9px] text-[#5B6B8C] dark:text-slate-500">
          {relativeTime(n.createdAt, locale)}
        </time>
      </span>
    </>
  );
}

export function NotificationBell({ scope }: { scope: "user" | "admin" }) {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const viewAll = scope === "admin" ? "/admin/notifications" : "/dashboard/notifications";

  const loadCount = useCallback(() => {
    void getUnreadCountAction(scope).then(setUnread).catch(() => {});
  }, [scope]);

  const loadList = useCallback(() => {
    void listNotificationsAction(scope, { limit: 8 })
      .then((page) => {
        setItems(page.items);
        setUnread(page.unread);
      })
      .catch(() => setItems([]));
  }, [scope]);

  // Count: now, every 30s while the tab is visible, when the tab becomes visible or focused again, and on demand.
  useEffect(() => {
    loadCount();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") loadCount();
    }, POLL_MS);
    const revalidate = () => {
      if (document.visibilityState === "visible") loadCount();
    };
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    window.addEventListener(NOTIFICATIONS_EVENT, loadCount);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
      window.removeEventListener(NOTIFICATIONS_EVENT, loadCount);
    };
  }, [loadCount]);

  useEffect(() => {
    if (open) loadList();
  }, [open, loadList]);

  // Outside click closes.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const menuItems = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const list = menuItems();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Tab") setOpen(false);
  }

  // Focus the first item when the list arrives.
  useEffect(() => {
    if (!open || items === null) return;
    const frame = requestAnimationFrame(() => menuItems()[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, items]);

  async function openItem(n: NotificationView) {
    setOpen(false);
    setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? cur);
    if (!n.read) setUnread((u) => Math.max(0, u - 1));
    void markReadAction(scope, n.id).then((r) => setUnread(r.unread)).catch(() => {});
    if (n.href) router.push(n.href);
  }

  async function markAll() {
    setItems((cur) => cur?.map((x) => ({ ...x, read: true })) ?? cur);
    setUnread(0);
    void markAllReadAction(scope).then((r) => setUnread(r.unread)).catch(() => {});
  }

  const badge = unread > 9 ? "9+" : String(unread);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={unread > 0 ? t("notif.aria", { n: unread }) : t("notif.ariaNone")}
        className="relative flex h-8 w-8 items-center justify-center text-[#0F1B3D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-[#E6EDF5]"
      >
        <Bell className="h-[18px] w-[18px] stroke-[1.75]" />
        {unread > 0 ? (
          <span aria-hidden className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-semibold text-white">
            {badge}
          </span>
        ) : null}
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={t("notif.title")}
            onKeyDown={onMenuKey}
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-0 z-40 mt-2 w-[340px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_32px_-8px_rgba(15,27,61,0.18)] max-sm:fixed max-sm:top-[72px] max-sm:right-3 dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
              <p className="text-[12px] font-semibold text-ink dark:text-white">{t("notif.title")}</p>
              <button
                type="button"
                role="menuitem"
                onClick={() => void markAll()}
                disabled={unread === 0}
                className="rounded text-[10px] font-medium text-primary-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
              >
                {t("notif.markAll")}
              </button>
            </div>

            <div className="no-scrollbar max-h-[420px] overflow-y-auto">
              {items === null ? (
                <ul aria-busy="true" className="space-y-2 p-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <li key={i} className="animate-shimmer h-12 list-none rounded-xl" />
                  ))}
                </ul>
              ) : items.length === 0 ? (
                <p className="px-4 py-10 text-center text-[10.5px] text-[#5B6B8C] dark:text-slate-400">{t("notif.empty")}</p>
              ) : (
                <ul>
                  {items.map((n) => (
                    <li key={n.id} className="list-none">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => void openItem(n)}
                        className="relative flex w-full items-start gap-3 px-4 py-3 text-left transition outline-none hover:bg-slate-50 focus-visible:bg-slate-50 dark:hover:bg-white/5 dark:focus-visible:bg-white/5"
                      >
                        <NotificationItemBody n={n} locale={locale} />
                        {!n.read ? <span role="img" aria-label={t("notif.unreadDot")} className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-t border-slate-200/70 px-4 py-2.5 text-center dark:border-slate-800">
              <Link
                href={viewAll}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="rounded text-[10.5px] font-medium text-primary-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {t("notif.viewAll")}
              </Link>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

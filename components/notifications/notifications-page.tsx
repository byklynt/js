"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { FilterPill } from "@/components/ui/filter-pill";
import { NotificationItemBody, refreshNotifications } from "@/components/shell/notification-bell";
import { listNotificationsAction, markAllReadAction, markReadAction } from "@/lib/notification-actions";
import { NOTIFICATION_TYPES, type NotificationType, type NotificationView } from "@/lib/notifications-data";
import { useLanguage } from "@/lib/i18n/provider";

type Filter = "semua" | NotificationType;

/** Full list behind the bell: type filter, "show more" with a cursor, mark-all-read. */
export function NotificationsPage({ scope }: { scope: "user" | "admin" }) {
  const router = useRouter();
  const { t, locale } = useLanguage();
  const [filter, setFilter] = useState<Filter>("semua");
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (f: Filter, after: string | null) => {
      setBusy(true);
      try {
        const page = await listNotificationsAction(scope, { limit: 20, cursor: after, type: f === "semua" ? null : f });
        setItems((cur) => (after ? [...(cur ?? []), ...page.items] : page.items));
        setCursor(page.nextCursor);
        setUnread(page.unread);
        setFailed(false);
      } catch {
        setFailed(true);
        setItems((cur) => cur ?? []);
      } finally {
        setBusy(false);
      }
    },
    [scope]
  );

  useEffect(() => {
    queueMicrotask(() => void load(filter, null));
  }, [filter, load]);

  async function open(n: NotificationView) {
    setItems((cur) => cur?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? cur);
    await markReadAction(scope, n.id).catch(() => {});
    refreshNotifications();
    if (n.href) router.push(n.href);
  }

  async function markAll() {
    setItems((cur) => cur?.map((x) => ({ ...x, read: true })) ?? cur);
    setUnread(0);
    await markAllReadAction(scope).catch(() => {});
    refreshNotifications();
  }

  const options = [{ id: "semua" as Filter, label: t("common.all") }, ...NOTIFICATION_TYPES.map((x) => ({ id: x as Filter, label: t(`notif.type.${x}` as never) }))];

  return (
    <div>
      <PageHeader title={t("page.notifications")} subtitle={t(scope === "admin" ? "notif.page.subtitleAdmin" : "notif.page.subtitle")} />
      <div className="mx-auto mt-6 max-w-[760px]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <FilterPill options={options} value={filter} onChange={setFilter} ariaLabel={t("notif.filterLabel")} />
          <button
            type="button"
            onClick={() => void markAll()}
            disabled={unread === 0}
            className="rounded text-[10.5px] font-medium text-primary-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
          >
            {t("notif.markAll")}
          </button>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900">
          {items === null ? (
            <ul aria-busy="true" className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="animate-shimmer h-14 list-none rounded-xl" />
              ))}
            </ul>
          ) : failed ? (
            <p role="alert" className="px-4 py-12 text-center text-[10.5px] text-red-600 dark:text-red-300">{t("notif.error")}</p>
          ) : items.length === 0 ? (
            <p className="px-4 py-12 text-center text-[10.5px] text-[#5B6B8C] dark:text-slate-400">{t("notif.empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-200/70 dark:divide-slate-800">
              {items.map((n) => (
                <li key={n.id} className="list-none">
                  <button
                    type="button"
                    onClick={() => void open(n)}
                    className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition outline-none hover:bg-slate-50 focus-visible:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <NotificationItemBody n={n} locale={locale} />
                    {!n.read ? <span role="img" aria-label={t("notif.unreadDot")} className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cursor ? (
          <div className="mt-4 text-center">
            <button
              type="button"
              disabled={busy}
              onClick={() => void load(filter, cursor)}
              className="h-9 rounded-full border border-slate-200/70 px-5 text-[10.5px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 dark:border-slate-700 dark:text-white dark:hover:bg-white/5"
            >
              {t("common.showMore")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

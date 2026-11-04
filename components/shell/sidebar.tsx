"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import type { NavItem } from "@/lib/nav-config";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/provider";
import { slugOf } from "@/lib/i18n";

const rowBase =
  "flex h-10 w-full min-w-0 items-center gap-2.5 rounded-full px-3 text-[10px] font-medium transition";
const iconClass = "h-4 w-4 shrink-0 stroke-[1.75]";

function isActive(pathname: string, item: NavItem) {
  if (!item.href) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function MenuRow({
  item,
  active,
  badge,
  onLogout,
}: {
  item: NavItem;
  active: boolean;
  badge: number;
  onLogout: () => void;
}) {
  const { t } = useLanguage();
  const label = item.labelKey ? t(item.labelKey) : item.label;
  const content = (
    <>
      <item.icon className={iconClass} />
      <span title={label} className={cn("min-w-0 flex-1 truncate text-left whitespace-nowrap", label.length > 16 && "tracking-[-0.06em]")}>{label}</span>
      {badge > 0 ? (
        <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[5px] bg-primary-solid px-1 text-[9px] font-semibold text-white">
          {badge}
        </span>
      ) : null}
      {active ? <ChevronRight className="h-4 w-4 shrink-0 stroke-[1.75]" /> : null}
    </>
  );

  if (item.action === "logout" || !item.href) {
    return (
      <button
        type="button"
        onClick={onLogout}
        className={cn(
          rowBase,
          "text-ink hover:bg-red-50 hover:text-red-600 dark:font-normal dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-300"
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        rowBase,
        active
          ? "bg-gradient-to-b from-primary-from to-primary-to text-white shadow-[0_2px_0_var(--primary-pressed)]"
          : "text-ink hover:bg-primary-50 hover:text-primary-accent dark:font-normal dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-primary-300"
      )}
    >
      {content}
    </Link>
  );
}

function Divider() {
  return <div className="mx-auto my-3.5 h-px w-[105px] bg-slate-200 dark:bg-slate-800" />;
}

export type SidebarAccount = { label: string; name: string };

type SidebarProps = {
  nav: NavItem[];
  account: SidebarAccount;
  badges?: Record<string, number>;
  onLogout: () => void;
  brandHref?: string;
  /** Small pill rendered next to the logo, e.g. "Admin". */
  brandTag?: string;
};

function SidebarContent({
  nav,
  account,
  badges = {},
  onLogout,
  brandHref = "/",
  brandTag,
  onNavigate,
}: SidebarProps & { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { tr } = useLanguage();
  const scroller = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);

  // Show the bottom fade only while there is more content below. The observers fire once on attach, so no
  // synchronous setState in the effect body.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const update = () => setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  // Items sharing a group render together; groups keep first-appearance order.
  const groups: { label: string; items: NavItem[] }[] = [];
  for (const item of nav) {
    const existing = groups.find((g) => g.label === item.group);
    if (existing) existing.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }

  return (
    <div className="relative flex min-h-0 w-full min-w-0 flex-1 flex-col">
    <div ref={scroller} className="no-scrollbar flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
      <div className="flex h-[67px] shrink-0 items-center justify-center gap-1.5 border-b border-slate-200/70 px-2 dark:border-slate-800">
        <Logo href={brandHref} size={brandTag ? "sm" : "md"} />
        {brandTag ? (
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[9px] font-semibold text-primary-accent">
            {brandTag}
          </span>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col px-[11px] py-[25px]">
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-1.5 text-left transition hover:border-primary-200 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-primary-800"
        >
          <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-primary-solid text-[10px] font-semibold text-white">
            {account.name.charAt(0).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[8px] text-slate-500">{tr(`account.${account.label === "Akun Saya" ? "myAccount" : "adminLabel"}`, account.label)}</span>
            <span className="block truncate text-[10px] font-semibold text-ink dark:text-slate-100">
              {account.name}
            </span>
          </span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 dark:border-slate-700">
            <ChevronDown className="h-3 w-3" />
          </span>
        </button>

        {groups.map((group, index) => (
          <div key={group.label} className="contents">
            {index > 0 ? <Divider /> : null}
            <nav
              aria-label={tr(`group.${slugOf(group.label)}`, group.label)}
              className={cn("space-y-[3px]", index === 0 && "mt-[18px]")}
              onClick={onNavigate}
            >
              {group.items.map((item) => (
                <MenuRow
                  key={item.label}
                  item={item}
                  active={isActive(pathname, item)}
                  badge={item.badgeKey ? (badges[item.badgeKey] ?? 0) : 0}
                  onLogout={onLogout}
                />
              ))}
            </nav>
          </div>
        ))}
      </div>
    </div>
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-4 bg-gradient-to-t from-white to-transparent transition-opacity duration-200 dark:from-slate-950",
        moreBelow ? "opacity-100" : "opacity-0"
      )}
    />
    </div>
  );
}

export function Sidebar({
  mobileOpen,
  onCloseMobile,
  ...props
}: SidebarProps & { mobileOpen: boolean; onCloseMobile: () => void }) {
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[182px] shrink-0 box-border overflow-hidden border-r border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-950 lg:flex lg:flex-col">
        <SidebarContent {...props} />
      </aside>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onCloseMobile}
            className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm lg:hidden"
            aria-hidden
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {mobileOpen ? (
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col overflow-hidden bg-white shadow-2xl dark:bg-slate-950 lg:hidden"
          >
            <div className="flex shrink-0 items-center justify-end px-4 pt-4">
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={onCloseMobile}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-primary-100 text-slate-500 dark:border-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <SidebarContent {...props} onNavigate={onCloseMobile} />
          </motion.aside>
        ) : null}
      </AnimatePresence>
    </>
  );
}

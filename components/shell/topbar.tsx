"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Menu,
  ChevronDown,
  Settings,
  Moon,
} from "lucide-react";
import type { Crumb } from "@/lib/nav-config";
import { BALANCE_EVENT, formatBalance } from "@/lib/balance";
import { getMyBalance } from "@/lib/user-actions";
import { useLanguage } from "@/lib/i18n/provider";
import { slugOf } from "@/lib/i18n";
import { LanguageSwitcher } from "./language-switcher";

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onOutside();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onOutside();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onOutside]);

  return ref;
}

const noopSubscribe = () => () => {};

/** false during SSR + hydration, true afterwards (avoids theme-dependent hydration mismatch). */
function useIsMounted() {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

function ThemeTogglePill() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useIsMounted();
  const { t } = useLanguage();
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? t("topbar.themeToLight") : t("topbar.themeToDark")}
      className="flex h-8 items-center gap-1.5 rounded-lg px-1 text-[10.5px] font-medium text-[#0F1B3D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-[#E6EDF5]"
    >
      {isDark ? <Moon className="h-[15px] w-[15px] stroke-[1.75]" /> : <Settings className="h-[15px] w-[15px] stroke-[1.75]" />}
      <span className="hidden sm:inline">{isDark ? t("topbar.dark") : t("topbar.light")}</span>
    </button>
  );
}

export function CurrencyPill() {
  const [open, setOpen] = useState(false);
  const [balance, setBalance] = useState(0);
  const pathname = usePathname();

  // The real balance comes from the server (ledger). Re-read on navigation and after money events.
  useEffect(() => {
    let alive = true;
    const load = () => void getMyBalance().then((b) => alive && b !== null && setBalance(b)).catch(() => {});
    load();
    window.addEventListener(BALANCE_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(BALANCE_EVENT, load);
    };
  }, [pathname]);
  const ref = useClickOutside(() => setOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-10 items-center gap-1.5 rounded-full border border-slate-200/70 bg-white py-1 pr-2 pl-1 max-[380px]:pl-3 sm:gap-2 sm:pr-3 shadow-none transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-primary-border dark:bg-[#0F1822] dark:hover:bg-[#142130] text-[12px] font-semibold text-ink dark:text-white"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-accent max-[380px]:hidden">
          Rp
        </span>
        {formatBalance(balance)}
        <ChevronDown className="h-3.5 w-3.5 stroke-[1.75] text-[#8FA1B5] max-[380px]:hidden" />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-2 w-40 rounded-xl border border-primary-100 bg-white p-1.5 text-[9.5px] shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="rounded-lg bg-primary-50 px-2.5 py-2 font-semibold text-primary-accent dark:bg-primary-950/60 dark:text-primary-300">
            IDR - Rupiah
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function Topbar({
  onMenuClick,
  breadcrumbs,
  trailPrefix = ["Beranda"],
  pill,
  bell,
  accountMenu,
}: {
  onMenuClick: () => void;
  breadcrumbs: Record<string, Crumb>;
  /** Plain segments shown before the current page, e.g. ["Beranda", "Admin"]. */
  trailPrefix?: string[];
  /** Pill between the globe icon and the account menu (currency, revenue, ...). */
  pill: React.ReactNode;
  /** Notification bell (popover). */
  bell: React.ReactNode;
  accountMenu: React.ReactNode;
}) {
  const pathname = usePathname();
  const { t, tr } = useLanguage();
  // Exact path first, then dynamic entries such as "/dashboard/tickets/[id]".
  const dynamic = Object.entries(breadcrumbs).find(([key]) => key.includes("[") && new RegExp(`^${key.replace(/\[[^/]+\]/g, "[^/]+")}$`).test(pathname));
  const raw = breadcrumbs[pathname] ?? dynamic?.[1] ?? { label: "Dashboard", subtitle: "" };
  const crumb = {
    ...raw,
    label: raw.labelKey ? t(raw.labelKey) : raw.label,
    subtitle: raw.subtitleKey ? t(raw.subtitleKey) : raw.subtitle,
    parents: raw.parents?.map((p) => tr(`nav.${slugOf(p)}`, p)),
  };

  return (
    <header className="sticky top-0 z-20 h-[67px] border-b border-slate-200/70 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
      <div className="flex h-[67px] items-center justify-between gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            aria-label={t("topbar.menuOpen")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary-100 text-slate-500 dark:border-slate-700 dark:text-slate-300 lg:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="hidden min-w-0 sm:block">
            <p className="truncate text-[11px] font-medium text-slate-500">
              {trailPrefix.map((part) => (
                <span key={part}>
                  {part === "Beranda" ? t("common.home") : part} <span className="mx-1 text-slate-400">/</span>
                </span>
              ))}
              {crumb.parents?.map((part) => (
                <span key={part}>
                  {part} <span className="mx-1 text-slate-400">/</span>
                </span>
              ))}
              <span className="font-semibold text-primary-accent">{crumb.label}</span>
            </p>
            {crumb.subtitle ? (
              <p className="truncate text-[9.5px] text-slate-500">{crumb.subtitle}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <ThemeTogglePill />
          {bell}
          <LanguageSwitcher />
          {pill}
          {accountMenu}
        </div>
      </div>
    </header>
  );
}

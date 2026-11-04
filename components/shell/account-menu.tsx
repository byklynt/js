"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Menu } from "lucide-react";
import { useDashboardUser } from "./user-context";
import { useLanguage } from "@/lib/i18n/provider";

export type AccountMenuItem = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  action?: "logout";
  /** Render the icon filled (e.g. a star). */
  filledIcon?: boolean;
};

const itemClass =
  "flex h-9 w-full items-center gap-2.5 rounded-xl px-2.5 text-left text-[10.5px] font-medium text-ink transition outline-none hover:bg-primary-50 focus-visible:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary dark:text-slate-100 dark:hover:bg-white/5 dark:focus-visible:bg-white/5";

export function AccountMenu({
  items,
  viewHref,
  viewLabel,
  onLogout,
}: {
  items: AccountMenuItem[];
  viewHref: string;
  viewLabel?: string;
  onLogout: () => Promise<void> | void;
}) {
  const { username, email } = useDashboardUser();
  const { t, tr } = useLanguage();
  const KEYS: Record<string, string> = { Afiliasi: "account.affiliates", Akun: "account.account", Keluar: "account.logout" };
  const itemLabel = (l: string) => tr(KEYS[l] ?? `account.${l}`, l);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function menuItems(): HTMLElement[] {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  // Move focus to the first item whenever the menu opens (not during the exit animation).
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menuItems()[0]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  // Outside click closes without stealing focus.
  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function handleMenuKeyDown(e: React.KeyboardEvent) {
    const list = menuItems();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      list[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      list[list.length - 1]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  async function handleLogout() {
    setOpen(false);
    await onLogout();
  }

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
          if (e.key === "Escape" && open) close(true);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("account.menuOpen")}
        className="flex h-10 items-center gap-2 rounded-full border border-slate-200/70 bg-white py-1 pr-3 pl-1 shadow-none transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-primary-border dark:bg-[#0F1822] dark:hover:bg-[#142130]"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[11px] font-semibold text-primary-accent">
          {username.charAt(0).toUpperCase()}
        </span>
        <Menu className="h-4 w-4 stroke-[1.75] text-ink dark:text-white" />
      </button>

      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={t("account.menu")}
            onKeyDown={handleMenuKeyDown}
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-0 z-40 mt-2 w-[260px] rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_12px_32px_-8px_rgba(15,27,61,0.18)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
          >
            <p className="truncate text-[12px] font-semibold text-ink dark:text-white">{username}</p>
            <p className="truncate text-[10px] text-[#5B6B8C] dark:text-slate-400">{email}</p>
            <Link
              href={viewHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="mt-3 flex h-9 w-full items-center justify-center rounded-xl border border-slate-200 text-[10.5px] font-medium text-ink transition outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary dark:border-slate-700 dark:text-white dark:hover:bg-white/5"
            >
              {viewLabel ?? t("account.view")}
            </Link>
            <div className="my-3 h-px bg-slate-200/70 dark:bg-slate-800" />
            {items.map((item) =>
              item.action === "logout" || !item.href ? (
                <button key={item.label} type="button" role="menuitem" onClick={handleLogout} className={itemClass}>
                  <item.icon className="h-4 w-4 stroke-[1.75]" aria-hidden />
                  {itemLabel(item.label)}
                </button>
              ) : (
                <Link
                  key={item.label}
                  href={item.href}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className={itemClass}
                >
                  <item.icon
                    className={item.filledIcon ? "h-4 w-4 fill-current stroke-[1.75]" : "h-4 w-4 stroke-[1.75]"}
                    aria-hidden
                  />
                  {itemLabel(item.label)}
                </Link>
              )
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

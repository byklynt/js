"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Globe } from "lucide-react";
import { LANGS, type Lang } from "@/lib/i18n";
import { useLanguage } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

/** Globe button with a small language menu (Indonesia / English). The check marks the active language. */
export function LanguageSwitcher() {
  const { lang, t, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const items = () => Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? []);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => (items().find((e) => e.getAttribute("aria-checked") === "true") ?? items()[0])?.focus());
    function onDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  function onKey(e: React.KeyboardEvent) {
    const list = items();
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      list[(i + 1) % list.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length]?.focus();
    } else if (e.key === "Tab") setOpen(false);
  }

  function choose(next: Lang) {
    setOpen(false);
    triggerRef.current?.focus();
    if (next !== lang) setLanguage(next);
  }

  return (
    <div ref={rootRef} className="relative hidden sm:block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t("lang.title")}
        className="flex h-8 w-8 items-center justify-center text-[#0F1B3D] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:text-[#E6EDF5]"
      >
        <Globe className="h-[18px] w-[18px] stroke-[1.75]" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={t("lang.menu")}
            onKeyDown={onKey}
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -6 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            style={{ transformOrigin: "top right" }}
            className="absolute top-full right-0 z-40 mt-2 w-[180px] rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(15,27,61,0.18)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
          >
            {LANGS.map((l) => {
              const active = l === lang;
              return (
                <button
                  key={l}
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  onClick={() => choose(l)}
                  className={cn(
                    "flex h-9 w-full items-center justify-between rounded-xl px-2.5 text-left text-[10.5px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-primary",
                    active ? "bg-primary-50 text-primary-accent dark:bg-primary-soft" : "text-ink hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-white/5"
                  )}
                >
                  {t(l === "id" ? "lang.id" : "lang.en")}
                  {active ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

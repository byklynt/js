"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { DashboardPortal } from "@/components/shared/portal";
import { cn } from "@/lib/utils";

export type ActionMenuItem = {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  tone?: "danger";
  disabled?: boolean;
};

/**
 * Kebab menu for table rows. Rendered in a portal with fixed positioning so it is never
 * clipped by the table's scroll container. Arrow keys / Home / End navigate, Escape closes.
 */
export function ActionMenu({ label, items }: { label: string; items: ActionMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function focusables() {
    return Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 200;
    const height = items.length * 36 + 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < height + 12 ? Math.max(8, rect.top - height - 4) : rect.bottom + 4;
    setPos({ top, left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)) });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => focusables()[0]?.focus());
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    }
    function onDismiss() {
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    const list = focusables();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
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

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/70 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <DashboardPortal>
          <div
            id={menuId}
            ref={menuRef}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            className="fixed z-[55] w-[200px] rounded-xl border border-slate-200/80 bg-white p-1.5 shadow-[0_12px_32px_-8px_rgba(15,27,61,0.18)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-none"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cn(
                  "flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[10.5px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50",
                  item.tone === "danger"
                    ? "text-red-600 hover:bg-red-50 focus-visible:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                    : "text-ink hover:bg-primary-50 focus-visible:bg-primary-50 dark:text-slate-100 dark:hover:bg-white/5"
                )}
              >
                {item.icon ? <item.icon className="h-4 w-4 stroke-[1.75]" aria-hidden /> : null}
                {item.label}
              </button>
            ))}
          </div>
        </DashboardPortal>
      ) : null}
    </>
  );
}

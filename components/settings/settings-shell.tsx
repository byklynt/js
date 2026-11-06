"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Trophy } from "lucide-react";
import { settingsNav } from "@/lib/settings-data";
import type { SettingsNavItem } from "@/lib/settings-data";
import { useDashboardUser } from "@/components/shell/user-context";
import { cn } from "@/lib/utils";

/** Two-column settings layout: vertical settings nav + content. Fills the dashboard main area edge to edge. */
export function SettingsShell({
  children,
  nav = settingsNav,
  badge = "Starter",
  label = "Pengaturan akun",
}: {
  children: React.ReactNode;
  nav?: SettingsNavItem[];
  /** Pill under the e-mail (rank for users, role for admins). */
  badge?: string;
  label?: string;
}) {
  const pathname = usePathname();
  const { username, email } = useDashboardUser();

  return (
    <div className="-mx-4 -mt-6 -mb-10 flex min-h-[calc(var(--app-h)-67px)] flex-col sm:-mx-6 md:flex-row lg:-mx-[53px] lg:-mt-[60px]">
      <aside className="shrink-0 border-b border-slate-200/70 bg-white p-4 md:w-[215px] md:border-r md:border-b-0 md:p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-0">
          <div aria-hidden className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[22px] font-semibold text-primary-accent">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 md:mt-4">
            <p className="truncate text-[13px] font-semibold text-ink dark:text-white">{username}</p>
            <p className="truncate text-[10px] text-[#5B6B8C] dark:text-slate-400">{email}</p>
            <span className="mt-3 hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[9.5px] font-semibold text-amber-700 md:inline-flex dark:bg-amber-500/15 dark:text-amber-300">
              <Trophy className="h-3.5 w-3.5" aria-hidden />
              {badge}
            </span>
          </div>
        </div>

        <nav
          aria-label={label}
          className="thin-scroll -mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:mt-6 md:flex-col md:overflow-visible md:px-0 md:pb-0"
        >
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2.5 rounded-xl px-3 text-[10.5px] font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  active
                    ? "bg-[#0F1B3D] text-white shadow-sm dark:bg-[#1B2733]"
                    : "text-ink hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                )}
              >
                <item.icon className="h-4 w-4 stroke-[1.75]" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 bg-white dark:bg-slate-950">{children}</div>
    </div>
  );
}

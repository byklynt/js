"use client";

import { NotificationBell } from "@/components/shell/notification-bell";
import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound, Wallet } from "lucide-react";
import { adminLogout } from "@/lib/admin-auth";
import { adminBreadcrumbs, adminNav } from "@/lib/nav-config";
import { formatBalance } from "@/lib/balance";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import type { AccountMenuItem } from "@/components/shell/account-menu";

const accountItems: AccountMenuItem[] = [
  { label: "Profil", icon: UserRound, href: "/admin/settings/security" },
  { label: "Pengaturan", icon: Settings, href: "/admin/settings" },
  { label: "Keluar", icon: LogOut, action: "logout" },
];

function RevenuePill({ value }: { value: number }) {
  return (
    <div
      title="Pendapatan hari ini"
      className="flex h-11 items-center gap-2.5 rounded-full border border-slate-200/70 bg-white py-1.5 pr-3.5 pl-1.5 dark:border-primary-border dark:bg-[#0F2038]"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary-accent">
        <Wallet className="h-4 w-4" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[8px] text-[#5B6B8C] dark:text-slate-400">Pendapatan hari ini</span>
        <span className="block text-[12px] font-semibold text-ink dark:text-white">{formatBalance(value)}</span>
      </span>
    </div>
  );
}

/** Admin-area configuration of the shared dashboard shell. */
export function AdminShell({
  username,
  email,
  todayRevenue,
  pendingTickets,
  children,
}: {
  username: string;
  email: string;
  todayRevenue: number;
  pendingTickets: number;
  pendingDeposits?: number;
  children: React.ReactNode;
}) {
  const router = useRouter();

  async function handleLogout() {
    await adminLogout();
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <DashboardShell
      username={username}
      email={email}
      nav={adminNav}
      account={{ label: "Admin", name: username }}
      breadcrumbs={adminBreadcrumbs}
      trailPrefix={["Beranda", "Admin"]}
      pill={<RevenuePill value={todayRevenue} />}
      badges={{ tickets: pendingTickets }}
      bell={<NotificationBell scope="admin" />}
      accountMenuItems={accountItems}
      accountViewHref="/admin/settings/security"
      onLogout={handleLogout}
      brandHref="/admin"
      brandTag="Admin"
    >
      {children}
    </DashboardShell>
  );
}

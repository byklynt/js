"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import { logout } from "@/lib/auth-actions";
import { userBreadcrumbs, userNav } from "@/lib/nav-config";
import { useUnreadTicketCount } from "@/lib/tickets-store";
import { useUnseenUpdatesCount } from "@/lib/announcements-store";
import { DashboardShell } from "@/components/shell/dashboard-shell";
import { NotificationBell } from "@/components/shell/notification-bell";
import { CurrencyPill } from "@/components/shell/topbar";
import type { AccountMenuItem } from "@/components/shell/account-menu";
import { LegalFooter } from "@/components/legal/legal-page";

const accountItems: AccountMenuItem[] = [
  { label: "Akun", icon: Settings, href: "/dashboard/settings" },
  { label: "Keluar", icon: LogOut, action: "logout" },
];

/** User-area configuration of the shared dashboard shell. */
export function UserShell({
  username,
  email,
  children,
}: {
  username: string;
  email: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const unreadTickets = useUnreadTicketCount();
  const unseenUpdates = useUnseenUpdatesCount();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <DashboardShell
      username={username}
      email={email}
      nav={userNav}
      account={{ label: "Akun Saya", name: username }}
      breadcrumbs={userBreadcrumbs}
      pill={<CurrencyPill />}
      bell={<NotificationBell scope="user" />}
      badges={{ tickets: unreadTickets, updates: unseenUpdates }}
      accountMenuItems={accountItems}
      accountViewHref="/dashboard/settings"
      onLogout={handleLogout}
    >
      {children}
      <div className="-mx-4 mt-10 sm:-mx-6 lg:-mx-[53px]">
        <LegalFooter />
      </div>
    </DashboardShell>
  );
}

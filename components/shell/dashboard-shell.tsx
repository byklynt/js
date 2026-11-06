"use client";

import { useState } from "react";
import type { Crumb, NavItem } from "@/lib/nav-config";
import { ToastProvider } from "@/components/shared/toast";
import { Sidebar, type SidebarAccount } from "./sidebar";
import { Topbar } from "./topbar";
import { AccountMenu, type AccountMenuItem } from "./account-menu";
import { UserProvider } from "./user-context";

export type DashboardShellProps = {
  username: string;
  email: string;
  nav: NavItem[];
  account: SidebarAccount;
  breadcrumbs: Record<string, Crumb>;
  trailPrefix?: string[];
  /** Pill shown between the globe icon and the account menu. */
  pill: React.ReactNode;
  badges?: Record<string, number>;
  /** Notification bell for this area. */
  bell: React.ReactNode;
  accountMenuItems: AccountMenuItem[];
  accountViewHref: string;
  onLogout: () => Promise<void> | void;
  brandHref?: string;
  brandTag?: string;
  children: React.ReactNode;
};

/** Sidebar + topbar + content area shared by the user dashboard and the admin area. */
export function DashboardShell({
  username,
  email,
  nav,
  account,
  breadcrumbs,
  trailPrefix,
  pill,
  badges,
  bell,
  accountMenuItems,
  accountViewHref,
  onLogout,
  brandHref,
  brandTag,
  children,
}: DashboardShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <UserProvider value={{ username, email }}>
      <ToastProvider>
        <div className="dash min-h-[var(--app-h)] bg-white dark:bg-slate-950">
          <Sidebar
            nav={nav}
            account={account}
            badges={badges}
            onLogout={() => void onLogout()}
            brandHref={brandHref}
            brandTag={brandTag}
            mobileOpen={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
          />

          <div className="lg:pl-[182px]">
            <Topbar
              onMenuClick={() => setMobileOpen(true)}
              breadcrumbs={breadcrumbs}
              trailPrefix={trailPrefix}
              pill={pill}
              bell={bell}
              accountMenu={
                <AccountMenu items={accountMenuItems} viewHref={accountViewHref} onLogout={onLogout} />
              }
            />
            <main className="relative isolate w-full px-4 pt-6 pb-10 sm:px-6 sm:pt-6 lg:px-[53px] lg:pt-[60px]">
              {children}
            </main>
          </div>
        </div>
      </ToastProvider>
    </UserProvider>
  );
}

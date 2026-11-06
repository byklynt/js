import { Suspense } from "react";
import { LangBoundary } from "@/components/shell/lang-boundary";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireAdmin } from "@/lib/auth-server";
import { getShellStats } from "@/lib/server/admin/shell-stats";

export default function PanelLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PanelFallback />}>
      <PanelGate>{children}</PanelGate>
    </Suspense>
  );
}

/** Guarded layout: calls requireAdmin() itself (proxy.ts is only the first line of defence). */
async function PanelGate({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const stats = await getShellStats();
  return (
    <LangBoundary>
    <AdminShell
      username={admin.username}
      email={admin.email}
      todayRevenue={stats.todayRevenue}
      pendingTickets={stats.pendingTickets}
      pendingDeposits={stats.pendingDeposits}
    >
      {children}
    </AdminShell>
    </LangBoundary>
  );
}

function PanelFallback() {
  return (
    <div aria-busy="true" className="min-h-[var(--app-h)] bg-white dark:bg-slate-950">
      <div className="mx-auto max-w-[1100px] space-y-4 px-6 pt-24">
        <div className="animate-shimmer h-8 w-48 rounded-md" />
        <div className="animate-shimmer h-4 w-72 rounded-md" />
        <div className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="animate-shimmer h-[115px] rounded-2xl" />
          ))}
        </div>
      </div>
    </div>
  );
}

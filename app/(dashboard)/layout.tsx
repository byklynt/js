import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MaintenanceGate } from "@/components/dashboard/maintenance-gate";
import { getCurrentUser } from "@/lib/auth-actions";
import { CatalogBoundary } from "@/components/dashboard/catalog-boundary";
import { LangBoundary } from "@/components/shell/lang-boundary";
import { UserShell } from "@/components/dashboard/user-shell";

export default function DashboardGroupLayout({ children }: { children: React.ReactNode }) {
  // The signed-in user comes from a cookie (runtime data), so everything is resolved inside a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <UserGate>{children}</UserGate>
    </Suspense>
  );
}

/** Guarded layout: re-checks the session against the store (proxy.ts is only the first line of defence). */
async function UserGate({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <LangBoundary>
      <UserShell username={user.username} email={user.email}>
        <CatalogBoundary />
        <Suspense fallback={null}>
          <MaintenanceGate>{children}</MaintenanceGate>
        </Suspense>
      </UserShell>
    </LangBoundary>
  );
}

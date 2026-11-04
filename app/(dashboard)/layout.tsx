import { Suspense } from "react";
import { redirect } from "next/navigation";
import { MaintenanceGate } from "@/components/dashboard/maintenance-gate";
import { getCurrentUser } from "@/lib/auth-actions";
import { CatalogBoundary } from "@/components/dashboard/catalog-boundary";
import { LangBoundary } from "@/components/shell/lang-boundary";
import { UserShell } from "@/components/dashboard/user-shell";

export default async function DashboardGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  // The shell reads the current URL (active menu item, breadcrumb). On dynamic routes such as /dashboard/tickets/[id]
  // that is runtime data, so the shell sits inside a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <LangBoundary>
        <UserShell username={user.username} email={user.email}>
          <CatalogBoundary />
          <Suspense fallback={null}>
            <MaintenanceGate>{children}</MaintenanceGate>
          </Suspense>
        </UserShell>
      </LangBoundary>
    </Suspense>
  );
}

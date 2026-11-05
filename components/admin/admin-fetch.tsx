import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth-server";
import { withAdminDb } from "@/lib/server/admin-snapshot";

/**
 * Wraps an admin page's data loading: dynamic (reads the session), guarded by requireAdmin(),
 * and streamed behind a skeleton. Usage:
 *   export default function Page() { return <AdminData>{() => <View data={getX()} />}</AdminData>; }
 */
export function AdminData({ children }: { children: () => React.ReactNode | Promise<React.ReactNode> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guarded render={children} />
    </Suspense>
  );
}

async function Guarded({ render }: { render: () => React.ReactNode | Promise<React.ReactNode> }) {
  await requireAdmin();
  // getDb() inside the page's render function = a snapshot built from Supabase for THIS request (lib/server/admin-snapshot.ts).
  return withAdminDb(async () => <>{await render()}</>);
}

function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat halaman" className="space-y-4 pt-6">
      <div className="animate-shimmer h-8 w-48 rounded-md" />
      <div className="animate-shimmer h-4 w-72 rounded-md" />
      <div className="grid gap-4 pt-8 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-shimmer h-[115px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

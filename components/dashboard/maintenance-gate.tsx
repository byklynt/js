import { connection } from "next/server";
import { Wrench } from "lucide-react";
import { loadSettings } from "@/lib/server/repo/settings";
import { getSession } from "@/lib/auth-server";
import { maintenanceBlocks } from "@/lib/server/access";

/** Replaces the page with a friendly notice while maintenance mode is on. Admins are never blocked. */
export async function MaintenanceGate({ children }: { children: React.ReactNode }) {
  await connection();
  const session = await getSession();
  const { general } = await loadSettings();
  if (!maintenanceBlocks(general.maintenance, session?.role ?? "user")) return <>{children}</>;
  return (
    <div role="status" className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-accent dark:bg-slate-900">
        <Wrench className="h-6 w-6" aria-hidden />
      </span>
      <h1 className="mt-5 text-xl font-bold text-ink dark:text-white">Sedang pemeliharaan</h1>
      <p className="mt-2 text-[11px] text-[#5B6B8C] dark:text-slate-400">
        Kami sedang meningkatkan layanan. Saldo dan pesananmu aman. Silakan kembali beberapa saat lagi.
      </p>
      <p className="mt-4 text-[10.5px] text-[#5B6B8C] dark:text-slate-400">
        Butuh bantuan? Hubungi {general.supportEmail}
      </p>
    </div>
  );
}

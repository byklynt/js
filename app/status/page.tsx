import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { LegalPage } from "@/components/legal/legal-page";
import { loadSyncHealthDb } from "@/lib/server/admin/sync-health";
import { STALL_MINUTES, syncHealth } from "@/lib/server/metrics";
import { formatDateTime } from "@/lib/balance";

export const metadata: Metadata = { title: "Status Layanan - JagoanSosmed" };

export default function Page() {
  return (
    <LegalPage title="Status Layanan" subtitle="Dihitung dari sinkronisasi pesanan dengan penyedia layanan.">
      <Suspense fallback={<p>Memuat status...</p>}>
        <Status />
      </Suspense>
    </LegalPage>
  );
}

async function Status() {
  await connection();
  const db = await loadSyncHealthDb();
  // Provider names stay private: the public page only shows generic lanes.
  const rows = syncHealth(db).map((h, i) => {
    const state = h.stalled ? "Terganggu" : h.failingRuns >= 3 ? "Gangguan" : h.failingRuns > 0 ? "Melambat" : "Normal";
    return { name: `Jalur layanan ${String.fromCharCode(65 + i)}`, state, at: h.lastSyncedAt };
  });
  const allOk = rows.every((r) => r.state === "Normal");
  return (
    <>
      <p
        role="status"
        className={`rounded-xl px-4 py-3 text-sm font-semibold ${allOk ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"}`}
      >
        {allOk ? "Semua layanan berjalan normal." : "Sebagian layanan sedang mengalami gangguan. Pesanan tetap tercatat dan akan diproses."}
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 dark:border-slate-800">
            <div>
              <p className="font-medium text-slate-900 dark:text-white">{r.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{r.at ? `Sinkron terakhir ${formatDateTime(r.at)}` : "Belum ada data sinkronisasi"}</p>
            </div>
            <span className="text-xs font-semibold">{r.state}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500 dark:text-slate-400">Status Terganggu muncul jika tidak ada sinkronisasi selama {STALL_MINUTES} menit.</p>
    </>
  );
}

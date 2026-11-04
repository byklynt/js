import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { StatsView, type StatsUrlParams } from "@/components/admin/stats/stats-view";
import { buildStatsDatasetFromDb } from "@/lib/admin-stats-data";
import { getDb } from "@/lib/admin-db";
import { todayIso } from "@/lib/server/time";
import { requireAdmin } from "@/lib/auth-server";
import { computeStats, type RangeId, type TabId } from "@/lib/server/stats";

export const metadata: Metadata = { title: "Statistik - Admin JagoanSosmed" };

const TABS: TabId[] = ["keuangan", "layanan", "pengguna", "provider", "operasional"];
const RANGES: RangeId[] = ["hari", "7", "30", "90", "bulan", "kustom"];

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function Page(props: { searchParams: SearchParams }) {
  return (
    <AdminData>
      {async () => {
        // Guarded here as well as inside AdminData: every data function re-checks the session.
        await requireAdmin();
        const sp = await props.searchParams;
        const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]);
        const ds = buildStatsDatasetFromDb(getDb());
        const tab = TABS.includes(one("tab") as TabId) ? (one("tab") as TabId) : "keuangan";
        const range = RANGES.includes(one("range") as RangeId) ? (one("range") as RangeId) : "30";
        const provider = ds.providers.some((p) => p.id === one("provider")) ? (one("provider") as string) : "semua";
        const platform = ds.platforms.includes(one("platform") ?? "") ? (one("platform") as string) : "semua";
        const params: StatsUrlParams = { tab, range, from: one("from"), to: one("to"), provider, platform, compare: one("compare") === "1" };
        const result = computeStats(ds, tab, params, todayIso());
        return <StatsView result={result} params={params} providers={ds.providers.map((p) => ({ id: p.id, name: p.name }))} platforms={ds.platforms} />;
      }}
    </AdminData>
  );
}

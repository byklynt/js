import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { isSyncStalled } from "@/lib/server/metrics";

/** "Sinkronisasi terakhir" for the admin: the last SUCCESSFUL run of any provider, and whether the sync looks stalled (no success for 10 minutes). */
export async function loadSyncIndicator(now = new Date()): Promise<{ lastSuccessAt: string | null; stalled: boolean }> {
  const sb = supabaseAdmin();
  const [{ data: runs }, { count: work }, { count: ever }] = await Promise.all([
    sb.from("provider_sync_runs").select("finished_at,errors").eq("errors", 0).order("started_at", { ascending: false }).limit(1),
    sb.from("orders").select("id", { count: "exact", head: true }).neq("provider_order_id", "").in("status", ["menunggu", "diproses", "berjalan"]),
    sb.from("provider_sync_runs").select("id", { count: "exact", head: true }),
  ]);
  const lastSuccessAt = runs?.[0]?.finished_at ?? null;
  return { lastSuccessAt, stalled: isSyncStalled({ lastSuccessAt, hasRunBefore: (ever ?? 0) > 0, hasWork: (work ?? 0) > 0 }, now) };
}

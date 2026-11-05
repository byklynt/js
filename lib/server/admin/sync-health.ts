import "server-only";
import { createEmptyDb, type AdminDb } from "@/lib/admin-data";
import { loadProviders } from "@/lib/server/repo/providers";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Just the providers and their latest sync runs: what the public status page needs (syncHealth helper input). */
export async function loadSyncHealthDb(): Promise<AdminDb> {
  const db = createEmptyDb();
  const [providers, runs] = await Promise.all([loadProviders(), supabaseAdmin().from("provider_sync_runs").select("*").order("started_at", { ascending: false }).limit(60)]);
  db.providers = providers;
  db.syncRuns = (runs.data ?? []).map((r) => ({
    id: r.id, providerId: r.provider_id, startedAt: r.started_at, finishedAt: r.finished_at, ordersChecked: r.orders_checked, ordersChanged: r.orders_changed, errors: r.errors, errorMessage: r.error_message,
  }));
  return db;
}

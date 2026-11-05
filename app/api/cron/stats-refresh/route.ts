import { handleCron } from "@/lib/server/cron";
import { checkLikeo } from "@/lib/server/providers/balance";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * Housekeeping every 30 minutes (idempotent): refresh the provider balance, refresh stale delivery-time estimates, drop expired rate-limit counters and sync runs older than 30 days.
 * The dashboard and stats are computed live by Postgres aggregates, so there is no materialized view to refresh.
 */
export const maxDuration = 60;

async function handle(request: Request) {
  return handleCron(request, {
    name: "stats-refresh",
    ttlSeconds: 300,
    run: async () => {
      const sb = supabaseAdmin();
      let balance = "skipped";
      try {
        balance = (await checkLikeo({ force: true })).ok ? "ok" : "gagal";
      } catch {
        balance = "gagal";
      }
      const cutoff = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { data: rl } = await sb.from("rate_limits").delete().lt("window_start", cutoff).select("key");
      const { data: runs } = await sb.from("provider_sync_runs").delete().lt("started_at", new Date(Date.now() - 30 * 86_400_000).toISOString()).select("id");
      // Delivery-time estimates: recompute stale rows (older than a day, or a counted order finished after the row was written).
      const { data: refreshed } = await sb.rpc("refresh_completion_stats", { p_all: false });
      return { providerBalance: balance, rateLimitsPurged: rl?.length ?? 0, syncRunsPurged: runs?.length ?? 0, estimatesRefreshed: Number(refreshed ?? 0) };
    },
  });
}

export const GET = handle;
export const POST = handle;

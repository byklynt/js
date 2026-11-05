import { timingSafeEqual } from "node:crypto";
import { createProviderClient } from "@/lib/server/providers/client";
import { checkLikeo } from "@/lib/server/providers/balance";
import { syncOrders } from "@/lib/server/sync";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * Order status sync. Call every 2 minutes with `Authorization: Bearer $CRON_SECRET`
 * (Vercel Cron or pg_cron + pg_net: see docs/supabase-setup.md).
 * Providers: PROVIDER_MODE=mock|live decides whether Likeo is real (see lib/server/providers/README.md).
 */
async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, message: "CRON_SECRET belum diatur." }, { status: 503 });
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ ok: false }, { status: 401 });

  const summary = await syncOrders(createProviderClient());
  // Keep the real provider balance fresh (cached 60s) so the low-balance alert and the dashboard read real numbers.
  try {
    await checkLikeo();
  } catch {
    /* a failing balance call must not break the status sync; the failure shows under Provider */
  }
  // Daily sanity job (ledger vs balances, refund mismatches, stuck orders): only when the last run is older than 24 hours.
  const { data: last } = await supabaseAdmin().from("sanity_runs").select("created_at").order("created_at", { ascending: false }).limit(1);
  const due = !last?.length || Date.now() - new Date(last[0].created_at).getTime() > 24 * 3_600_000;
  let mismatches = 0;
  if (due) {
    const { data } = await supabaseAdmin().rpc("run_sanity_check");
    mismatches = data?.balance_mismatches ?? 0;
  }
  return Response.json({
    ok: true,
    checked: summary.runs.reduce((n, r) => n + r.ordersChecked, 0),
    changed: summary.runs.reduce((n, r) => n + r.ordersChanged, 0),
    errors: summary.runs.reduce((n, r) => n + r.errors, 0),
    refundsCreated: summary.refundsCreated,
    sanityRan: due,
    balanceMismatches: mismatches,
  });
}

export const GET = handle;
export const POST = handle;

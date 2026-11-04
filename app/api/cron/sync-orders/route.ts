import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/admin-db";
import { runSanityJob } from "@/lib/server/metrics";
import { createProviderClient } from "@/lib/server/providers/client";
import { checkLikeo } from "@/lib/server/providers/balance";
import { persistAdminState } from "@/lib/server/store";
import { syncOrders } from "@/lib/server/sync";

/**
 * Order status sync. Call every 2 minutes with `Authorization: Bearer $CRON_SECRET`.
 * TODO(hosting): schedule it (Vercel Cron, a Supabase pg_cron + http call, or any external pinger).
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

  const db = getDb();
  const summary = await syncOrders(db, createProviderClient(db));
  // Keep the real provider balance fresh (cached 60s) so the low-balance alert and the dashboard read real numbers.
  try {
    await checkLikeo(db);
  } catch {
    /* a failing balance call must not break the status sync; the failure shows under Provider */
  }
  persistAdminState(db);
  // Daily sanity job: only when the last run is older than 24 hours.
  const lastSanity = db.sanityRuns[0];
  const due = !lastSanity || Date.now() - new Date(lastSanity.at).getTime() > 24 * 3_600_000;
  const report = due ? runSanityJob(db) : null;
  return Response.json({
    ok: true,
    checked: summary.runs.reduce((n, r) => n + r.ordersChecked, 0),
    changed: summary.runs.reduce((n, r) => n + r.ordersChanged, 0),
    errors: summary.runs.reduce((n, r) => n + r.errors, 0),
    refundsCreated: summary.refundsCreated,
    sanityRan: due,
    balanceMismatches: report?.balanceMismatches.length ?? 0,
  });
}

export const GET = handle;
export const POST = handle;

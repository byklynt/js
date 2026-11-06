import { handleCron } from "@/lib/server/cron";
import { createProviderClient } from "@/lib/server/providers/client";
import { checkLikeo } from "@/lib/server/providers/balance";
import { syncOrders } from "@/lib/server/sync";
import { reconcilePendingDeposits } from "@/lib/server/payments/deposits-gateway";

/**
 * Order status sync (every 2 minutes). `Authorization: Bearer $CRON_SECRET` only; a lease stops overlapping runs; the run stops itself
 * before MAX_RUN_MS and the rest is picked up by the next tick. Scheduling: docs/supabase-setup.md (pg_cron, crontab, or `npm run dev:cron`).
 */
export const maxDuration = 60;
const MAX_RUN_MS = 50_000;

async function handle(request: Request) {
  return handleCron(request, {
    name: "sync-orders",
    ttlSeconds: 120,
    run: async () => {
      const startedAt = Date.now();
      const summary = await syncOrders(createProviderClient(), new Date(), { deadlineAt: startedAt + MAX_RUN_MS });
      try {
        await checkLikeo(); // keeps the provider balance fresh (cached 60 s); a failure shows under Provider, never breaks the sync
      } catch {
        /* recorded by checkLikeo */
      }
      // Paymenku deposits pending for more than 5 minutes (a lost webhook): ask Paymenku and apply the same credit function. Never breaks the order sync.
      let deposits: Awaited<ReturnType<typeof reconcilePendingDeposits>> | { error: true } = { error: true };
      try {
        deposits = await reconcilePendingDeposits({ deadlineAt: startedAt + 56_000 });
      } catch {
        /* the next tick tries again */
      }
      return {
        deposits,
        checked: summary.runs.reduce((n, r) => n + r.ordersChecked, 0),
        changed: summary.runs.reduce((n, r) => n + r.ordersChanged, 0),
        errors: summary.runs.reduce((n, r) => n + r.errors, 0),
        refundsCreated: summary.refundsCreated,
        requestsUpdated: summary.requestsUpdated,
        partial: summary.stoppedEarly,
      };
    },
  });
}

export const GET = handle;
export const POST = handle;

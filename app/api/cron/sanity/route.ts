import { handleCron } from "@/lib/server/cron";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Daily sanity check: ledger sum vs balances, refund mismatches, stuck orders (run_sanity_check). Idempotent: it only records a finding row. */
export const maxDuration = 60;

async function handle(request: Request) {
  return handleCron(request, {
    name: "sanity",
    ttlSeconds: 300,
    run: async () => {
      const { data, error } = await supabaseAdmin().rpc("run_sanity_check");
      if (error) throw new Error(error.message);
      return { balanceMismatches: data.balance_mismatches, refundMismatches: data.refund_mismatches, depositMismatches: data.deposit_mismatches, stuck: data.stuck };
    },
  });
}

export const GET = handle;
export const POST = handle;

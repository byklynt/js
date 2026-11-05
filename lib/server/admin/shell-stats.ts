import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { todayIso } from "@/lib/server/time";

export type ShellStats = { todayRevenue: number; pendingTickets: number; pendingDeposits: number; ok: boolean };

/**
 * Sidebar badges (revenue today, tickets waiting, deposits waiting) in one indexed query (admin_shell_stats).
 * Cached per request. It FAILS SOFT: if the query fails the badges show 0 and the error is logged, so a stats problem can never
 * take the admin layout down. It does not depend on any request snapshot.
 */
export const getShellStats = cache(async (): Promise<ShellStats> => {
  try {
    const since = new Date(`${todayIso()}T00:00:00+07:00`).toISOString();
    const { data, error } = await supabaseAdmin().rpc("admin_shell_stats", { p_since: since });
    if (error) throw new Error(error.message);
    const r = data?.[0];
    return { todayRevenue: Number(r?.revenue ?? 0), pendingTickets: Number(r?.tickets_waiting ?? 0), pendingDeposits: Number(r?.deposits_waiting ?? 0), ok: true };
  } catch (e) {
    console.error("[admin] shell stats failed:", e instanceof Error ? e.message : e);
    return { todayRevenue: 0, pendingTickets: 0, pendingDeposits: 0, ok: false };
  }
});

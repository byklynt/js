import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { Json } from "@/lib/supabase/database.types";

/**
 * Records every admin write action (change balance, edit service, ban user, answer ticket, edit settings...) in the
 * append-only audit_logs table. Money actions (balance, refunds) are audited INSIDE their Postgres function, in the same
 * transaction; this helper covers the rest. Kept out of the "use server" action files on purpose: exporting it from
 * there would expose it as a public endpoint.
 */
export async function logAdminAction(entry: {
  adminId: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
}): Promise<void> {
  const { error } = await supabaseAdmin().from("audit_logs").insert({
    admin_id: entry.adminId,
    admin_name: entry.adminName,
    action: entry.action,
    target_type: entry.targetType,
    target_id: entry.targetId,
    before: (entry.before ?? null) as Json,
    after: (entry.after ?? null) as Json,
  });
  if (error) console.error("[audit] gagal menulis audit log:", error.message);
}

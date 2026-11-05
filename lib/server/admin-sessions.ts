import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * Panel-side record of admin sign-ins ("Cabut sesi"). Supabase Auth cannot revoke ONE other session of a user from the
 * server, so each admin session id (JWT `session_id`) is tracked here and checked on every admin request. A revoked
 * session loses the panel immediately; its JWT only stops refreshing, and expires within the access-token lifetime (1h default).
 */
export type AdminSessionRow = { id: string; adminId: string; ip: string; userAgent: string; createdAt: string; lastSeenAt: string; revokedAt: string | null };

const toRow = (r: { id: string; admin_id: string; ip: string; user_agent: string; created_at: string; last_seen_at: string; revoked_at: string | null }): AdminSessionRow => ({
  id: r.id, adminId: r.admin_id, ip: r.ip, userAgent: r.user_agent, createdAt: r.created_at, lastSeenAt: r.last_seen_at, revokedAt: r.revoked_at,
});

export async function recordAdminSession(id: string, adminId: string, ip: string, userAgent: string) {
  await supabaseAdmin().from("admin_sessions").upsert({ id, admin_id: adminId, ip, user_agent: userAgent.slice(0, 160) }, { onConflict: "id" });
}

/** True when the session exists and is not revoked. Updates last_seen at most once a minute. */
export async function checkAdminSession(id: string | undefined, adminId: string): Promise<boolean> {
  if (!id) return false;
  const { data } = await supabaseAdmin().from("admin_sessions").select("revoked_at,last_seen_at,admin_id").eq("id", id).maybeSingle();
  if (!data || data.admin_id !== adminId || data.revoked_at) return false;
  if (Date.now() - new Date(data.last_seen_at).getTime() > 60_000) {
    await supabaseAdmin().from("admin_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", id);
  }
  return true;
}

export async function listAdminSessions(adminId: string): Promise<AdminSessionRow[]> {
  const { data } = await supabaseAdmin().from("admin_sessions").select("*").eq("admin_id", adminId).order("created_at", { ascending: false }).limit(50);
  return (data ?? []).map(toRow);
}

export async function revokeAdminSession(id: string, adminId: string): Promise<boolean> {
  const { data } = await supabaseAdmin().from("admin_sessions").update({ revoked_at: new Date().toISOString() })
    .eq("id", id).eq("admin_id", adminId).is("revoked_at", null).select("id");
  return (data?.length ?? 0) > 0;
}

export async function revokeOtherAdminSessions(adminId: string, keepId: string | undefined): Promise<number> {
  let q = supabaseAdmin().from("admin_sessions").update({ revoked_at: new Date().toISOString() }).eq("admin_id", adminId).is("revoked_at", null);
  if (keepId) q = q.neq("id", keepId);
  const { data } = await q.select("id");
  return data?.length ?? 0;
}

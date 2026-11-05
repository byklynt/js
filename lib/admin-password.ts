import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { verifyPasswordFor } from "@/lib/server/user-auth";

/** Re-authentication for money / security actions: checks the admin's current Supabase password without touching their session. */
export async function verifyAdminPassword(adminId: string, password: string): Promise<boolean> {
  if (!password) return false;
  const { data } = await supabaseAdmin().from("profiles").select("email,role").eq("id", adminId).maybeSingle();
  if (!data || data.role !== "admin") return false;
  return verifyPasswordFor(data.email, password);
}

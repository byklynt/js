import "server-only";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** The comments of a Custom Comments order (one per line), or null. Callers must have checked access (owner or admin) first. */
export async function getOrderComments(orderId: string | number): Promise<string[] | null> {
  const { data, error } = await supabaseAdmin().from("order_comments").select("comments").eq("order_id", Number(orderId)).maybeSingle();
  if (error) throw new Error(`order_comments: ${error.message}`);
  return data ? data.comments.split(String.fromCharCode(10)) : null;
}

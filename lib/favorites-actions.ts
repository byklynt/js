"use server";

import { z } from "zod";
import { currentUserId } from "@/lib/current-user";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Favorite services of the signed-in user (table `favorites`). The user comes from the session, never from the client. */
const idSchema = z.string().trim().regex(/^[\w-]{1,40}$/);

export async function getFavoritesAction(): Promise<string[]> {
  const userId = await currentUserId();
  if (!userId) return [];
  const { data } = await supabaseAdmin().from("favorites").select("service_id").eq("user_id", userId).order("created_at", { ascending: false }).limit(1000);
  return (data ?? []).map((r) => r.service_id);
}

export async function setFavoriteAction(serviceId: unknown, on: unknown): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  const id = idSchema.safeParse(serviceId);
  if (!userId || !id.success || typeof on !== "boolean") return { ok: false };
  const db = supabaseAdmin();
  if (on) {
    const { error } = await db.from("favorites").upsert({ user_id: userId, service_id: id.data }, { onConflict: "user_id,service_id", ignoreDuplicates: true });
    return { ok: !error };
  }
  const { error } = await db.from("favorites").delete().eq("user_id", userId).eq("service_id", id.data);
  return { ok: !error };
}

/** One-time import of the favorites that used to live in the browser (localStorage). Unknown service ids are ignored. */
export async function importFavoritesAction(ids: unknown): Promise<string[]> {
  const userId = await currentUserId();
  const parsed = z.array(idSchema).max(500).safeParse(ids);
  if (!userId || !parsed.success || !parsed.data.length) return getFavoritesAction();
  const db = supabaseAdmin();
  const { data: known } = await db.from("services").select("id").in("id", parsed.data);
  const rows = (known ?? []).map((s) => ({ user_id: userId, service_id: s.id }));
  if (rows.length) await db.from("favorites").upsert(rows, { onConflict: "user_id,service_id", ignoreDuplicates: true });
  return getFavoritesAction();
}

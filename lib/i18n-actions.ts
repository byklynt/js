"use server";

import { cookies } from "next/headers";
import { currentUserId } from "@/lib/current-user";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import { LANG_COOKIE, normalizeLang } from "@/lib/i18n";

/** Saves the language: the `lang` cookie (1 year) and, for a signed-in user, `profiles.language`. */
export async function setLanguageAction(value: unknown): Promise<{ ok: true; lang: "id" | "en" }> {
  const lang = normalizeLang(typeof value === "string" ? value : null);
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  const userId = await currentUserId();
  if (userId) await supabaseAdmin().from("profiles").update({ language: lang }).eq("id", userId);
  return { ok: true, lang };
}

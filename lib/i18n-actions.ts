"use server";

import { cookies } from "next/headers";
import { currentUserId } from "@/lib/current-user";
import { getStore } from "@/lib/server/store";
import { LANG_COOKIE, normalizeLang } from "@/lib/i18n";

/**
 * Saves the language: the `lang` cookie (1 year) and, for a signed-in user, the `language` field of the profile.
 * TODO(db): the profile field lives in the dev store (`languages`) until there is a users table with a language column.
 */
export async function setLanguageAction(value: unknown): Promise<{ ok: true; lang: "id" | "en" }> {
  const lang = normalizeLang(typeof value === "string" ? value : null);
  (await cookies()).set(LANG_COOKIE, lang, { path: "/", maxAge: 31_536_000, sameSite: "lax" });
  const userId = await currentUserId();
  if (userId) {
    const store = getStore();
    store.update({ languages: { ...(store.read().languages ?? {}), [userId]: lang } });
  }
  return { ok: true, lang };
}

import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, makeT, normalizeLang, type Lang } from "./index";

/** Reads the language cookie on the server (runtime data: call it inside a Suspense boundary). */
export async function getLang(): Promise<Lang> {
  return normalizeLang((await cookies()).get(LANG_COOKIE)?.value);
}

export async function getT() {
  return makeT(await getLang());
}

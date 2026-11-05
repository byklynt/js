import { getServicesByIds } from "@/lib/server/services";
import { json, userDbOr401 } from "@/lib/server/services-query";

/** Rows for up to 100 service ids (mass order validation). */
export async function GET(request: Request) {
  const auth = await userDbOr401();
  if ("response" in auth) return auth.response;
  const ids = (new URL(request.url).searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter((s) => /^[\w-]{1,40}$/.test(s)).slice(0, 100);
  return json({ items: getServicesByIds(auth.db, ids) });
}

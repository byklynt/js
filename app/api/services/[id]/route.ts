import { getServiceDetail } from "@/lib/server/services";
import { json, userDbOr401 } from "@/lib/server/services-query";

/** One service with its description, loaded only when the user opens "Deskripsi" or selects it. */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await userDbOr401();
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const detail = getServiceDetail(auth.db, id);
  return detail ? json(detail) : json({ error: "Layanan tidak ditemukan." }, 404);
}

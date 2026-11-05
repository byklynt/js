import { countServices, listCategories } from "@/lib/server/services";
import { json, parseServicesQuery, userDbOr401 } from "@/lib/server/services-query";

/** Categories with counts (respecting the same filters as the list), plus the total number of visible services. */
export async function GET(request: Request) {
  const auth = await userDbOr401();
  if ("response" in auth) return auth.response;
  const q = parseServicesQuery(new URL(request.url).searchParams);
  return json({ categories: listCategories(auth.db, q), totalServices: countServices(auth.db) });
}

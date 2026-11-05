import { getServices } from "@/lib/server/services";
import { json, parseServicesQuery, userDbOr401 } from "@/lib/server/services-query";

/** One page of services for the signed-in user. Filters, sorting and pagination happen on the server. */
export async function GET(request: Request) {
  const auth = await userDbOr401();
  if ("response" in auth) return auth.response;
  const q = parseServicesQuery(new URL(request.url).searchParams);
  return json(getServices(auth.db, q));
}

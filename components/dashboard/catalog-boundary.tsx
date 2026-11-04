import { connection } from "next/server";
import { getDb } from "@/lib/admin-db";
import { buildUserCatalog } from "@/lib/server/providers/catalog";
import { CatalogHydrator } from "./catalog-hydrator";

/**
 * Server component: gives the browser the services imported from the provider. Render before the page content, in the
 * layout (first load) AND in each page that reads the catalogue (a layout is not re-fetched on client navigation, a page is).
 */
export async function CatalogBoundary() {
  // Per request, never prerendered: the catalogue changes when an admin applies a provider sync.
  await connection();
  const catalog = buildUserCatalog(getDb());
  return <CatalogHydrator categories={catalog.categories} services={catalog.services} hiddenServiceIds={catalog.hiddenServiceIds} hiddenCategoryIds={catalog.hiddenCategoryIds} />;
}

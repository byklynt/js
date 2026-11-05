import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createEmptyDb, setPriceRounding, type AdminDb } from "@/lib/admin-data";
import { loadProviders } from "./repo/providers";
import { loadServicesOf } from "./repo/services-repo";
import { loadSettings } from "./repo/settings";

/**
 * Working copy for admin MUTATION handlers only (lib/admin-actions.ts): the site settings and rules, the providers and, when a handler
 * edits the catalogue, the services. It is NOT a read model: no orders, users, tickets or any list is loaded here (the admin pages read
 * their own data with paginated SQL, see lib/server/admin/*). A handler changes this object and lib/admin-actions.ts run() writes the
 * changes back with real queries. It exists only inside run(); outside of it actionDb() throws.
 */
const als = new AsyncLocalStorage<AdminDb>();

export function actionDb(): AdminDb {
  const db = als.getStore();
  if (!db) throw new Error("actionDb() hanya boleh dipakai di dalam run() pada admin-actions.");
  return db;
}

export async function withActionDb<T>(fn: () => Promise<T>, opts: { services?: boolean } = {}): Promise<T> {
  const [settings, providers] = await Promise.all([loadSettings(), loadProviders()]);
  const db = createEmptyDb();
  db.settings = structuredClone(settings);
  db.providers = providers;
  if (opts.services) db.services = (await Promise.all(providers.map((p) => loadServicesOf(p.id)))).flat();
  setPriceRounding(db.settings.pricing.roundTo);
  return als.run(db, fn);
}

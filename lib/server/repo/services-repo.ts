import "server-only";
import { createEmptyDb, finalPrice, setPriceRounding, type AdminDb, type AdminService } from "@/lib/admin-data";
import { applyCatalog, buildSyncPreview, type SyncPreview, type SyncResult } from "@/lib/server/providers/catalog";
import type { ProviderServiceInfo } from "@/lib/server/providers/types";
import { LIKEO_ID } from "@/lib/server/providers/config";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import { loadSettings } from "./settings";
import { loadProviders } from "./providers";

type ServiceRow = Tables<"services"> & { category: { label: string } | null };

export function toAdminService(r: ServiceRow): AdminService {
  return {
    id: r.id, categoryId: r.category_id, categoryLabel: r.category?.label ?? "Lainnya", platform: r.platform, name: r.name, badges: r.badges,
    providerId: r.provider_id, providerServiceId: r.provider_service_id, providerPrice: Number(r.provider_price), markupType: r.markup_type as "persen" | "tetap",
    markup: Number(r.markup_value), min: r.min, max: Number(r.max), refill: r.refill, refillDays: r.refill_days, cancel: r.cancel, active: r.active, sort: r.sort_order,
    providerName: r.provider_name ?? undefined, providerType: r.provider_type ?? undefined, providerRate: Number(r.rate_provider), syncedAt: r.synced_at ?? undefined,
    providerRemoved: r.provider_removed, imported: r.imported,
  };
}

/** price_per_1000 is stored (denormalised) so the catalogue can sort and filter in SQL; setPriceRounding must already be applied. */
export function toServiceRow(s: AdminService) {
  return {
    id: s.id, provider_id: s.providerId, provider_service_id: s.providerServiceId, category_id: s.categoryId, name: s.name, provider_name: s.providerName ?? null,
    platform: s.platform, rate_provider: s.providerRate ?? 0, provider_price: Math.round(s.providerPrice), markup_type: s.markupType, markup_value: s.markup,
    price_per_1000: finalPrice(s), min: s.min, max: s.max, refill: s.refill, refill_days: s.refillDays, cancel: s.cancel, badges: s.badges, active: s.active,
    provider_removed: Boolean(s.providerRemoved), imported: Boolean(s.imported), sort_order: s.sort, synced_at: s.syncedAt ?? null, provider_type: s.providerType ?? null,
  };
}

/** Every service of a provider (paged by 1000, the API row cap). */
export async function loadServicesOf(providerId: string): Promise<AdminService[]> {
  const out: AdminService[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin().from("services").select("*, category:service_categories(label)").eq("provider_id", providerId).order("id").range(from, from + 999);
    if (error) throw new Error(`services: ${error.message}`);
    out.push(...(data as unknown as ServiceRow[]).map(toAdminService));
    if ((data?.length ?? 0) < 1000) break;
  }
  return out;
}

export async function saveServices(services: AdminService[]): Promise<void> {
  const db = supabaseAdmin();
  const cats = new Map(services.map((s) => [s.categoryId, { id: s.categoryId, label: s.categoryLabel, platform: s.platform }]));
  if (cats.size) {
    const { error } = await db.from("service_categories").upsert([...cats.values()], { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error(`service_categories: ${error.message}`);
  }
  for (let i = 0; i < services.length; i += 500) {
    const { error } = await db.from("services").upsert(services.slice(i, i + 500).map(toServiceRow), { onConflict: "id" });
    if (error) throw new Error(`services: ${error.message}`);
  }
}

/** A throw-away AdminDb holding only what the (tested, pure) catalogue logic reads: settings, the provider and its services. */
async function unitDb(providerId: string): Promise<AdminDb> {
  const [settings, providers, services] = await Promise.all([loadSettings(), loadProviders(), loadServicesOf(providerId)]);
  const db = createEmptyDb();
  db.settings = settings;
  db.providers = providers;
  db.services = services;
  setPriceRounding(settings.pricing.roundTo);
  return db;
}

export async function previewCatalogSync(items: ProviderServiceInfo[], providerId = LIKEO_ID): Promise<SyncPreview> {
  return buildSyncPreview(await unitDb(providerId), providerId, items);
}

/** Applies the provider catalogue. Idempotent: a second run with the same list changes nothing. Price changes are recorded for the "Pembaruan" page. */
export async function applyCatalogSync(items: ProviderServiceInfo[], providerId = LIKEO_ID): Promise<{ result: SyncResult; fingerprint: string; blocked: string | null }> {
  const db = await unitDb(providerId);
  const preview = buildSyncPreview(db, providerId, items);
  if (preview.blocked) return { result: { created: 0, raised: 0, lowered: 0, deactivated: 0, restored: 0, thinMargin: 0, flagged: 0 }, fingerprint: preview.fingerprint, blocked: preview.blocked };
  const result = applyCatalog(db, providerId, items);
  const changed = db.services.filter((s) => s.providerId === providerId && s.imported);
  await saveServices(changed);
  const updates = db.priceUpdates.map((u) => ({ service_id: u.serviceId, platform: u.platform, name: u.name, type: u.type, detail: u.detail }));
  if (updates.length) await supabaseAdmin().from("price_updates").insert(updates);
  await supabaseAdmin().from("audit_logs").insert(db.auditLogs.map((l) => ({ admin_id: null, admin_name: "sistem", action: l.action, target_type: l.targetType, target_id: l.targetId, before: (l.before ?? null) as Json, after: (l.after ?? null) as Json })));
  return { result, fingerprint: preview.fingerprint, blocked: null };
}

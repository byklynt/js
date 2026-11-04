/**
 * Provider catalogue -> local services: normalising, pricing in Rupiah, the diff shown before "Terapkan", and applying it.
 * Pure over `db` and the list the adapter returned, so it is testable without any network.
 */
import { createHash } from "node:crypto";
import { finalPrice, type AdminDb, type AdminService, type MarkupType } from "@/lib/admin-data";
import type { Category, Service } from "@/lib/dashboard-data";
import { isThinMargin, marginPercent, afterProviderPriceChange, markupForMargin } from "../pricing";
import { logSystem } from "../notifications";
import { ServiceError } from "../tx";
import type { ProviderServiceInfo } from "./types";

// ---------------------------------------------------------------------------
// Normalising
// ---------------------------------------------------------------------------

/** Platform id (the ones in dashboard-data) guessed from the category text; "lainnya" when nothing matches. */
export function platformFromCategory(text: string): string {
  const t = text.toLowerCase();
  const rules: [RegExp, string][] = [
    [/instagram|\big\b|\binsta\b/, "instagram"],
    [/youtube|\byt\b/, "youtube"],
    [/tiktok|tik tok/, "tiktok"],
    [/facebook|\bfb\b/, "facebook"],
    [/twitter|\btweet|\bx\b|x\.com|x \(/, "twitter"],
    [/telegram/, "telegram"],
    [/spotify/, "spotify"],
    [/twitch/, "twitch"],
    [/reddit/, "reddit"],
    [/website traffic|web traffic|\btraffic\b/, "website-traffic"],
    [/\bseo\b|backlink/, "seo-backlink"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? "lainnya";
}

/** Drops emoji and decorative symbols, collapses spaces. The original stays in `providerName`. */
export function cleanServiceName(name: string): string {
  return name
    .replace(/[\p{Extended_Pictographic}‍️★☆✔✅❌⚡]/gu, "")
    .replace(/\s*[|]\s*/g, " | ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-|:]+|[\s\-|:]+$/g, "")
    .slice(0, 140);
}

export const slugOf = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "lainnya";

/** Only plain "Default" services are imported. Package, Custom Comments, Subscriptions, ... are listed as unsupported. */
export const isSupportedType = (type: string) => type.trim().toLowerCase() === "default" || type.trim() === "";

/** Provider rate per 1000 (provider currency) -> Rupiah per 1000, rounded up to a whole Rupiah. */
export function rateToRupiah(rate: number, rateIdr: number): number {
  return Math.max(1, Math.ceil(Math.round(rate * rateIdr * 10_000) / 10_000));
}

export type Markup = { markupType: MarkupType; markup: number };

/** New services get the category markup, else the provider markup, else the default. */
export function resolveMarkup(db: AdminDb, providerId: string, categoryLabel: string): Markup {
  const p = db.settings.pricing;
  return p.categoryMarkups[categoryLabel] ?? p.providerMarkups[providerId] ?? p.defaultMarkup;
}

/**
 * Why importing would produce unusable (zero or nonsense priced) services, or null when pricing is ready.
 * The sync is blocked while this returns text, so zero-price services are never imported.
 */
export function pricingProblem(db: AdminDb): string | null {
  const p = db.settings.pricing;
  if (!Number.isFinite(p.rateIdr) || p.rateIdr <= 0) return "Atur kurs dan markup dulu: kurs ke Rupiah belum diisi.";
  const m = p.providerMarkups[LIKEO_ID_FOR_PRICING] ?? p.defaultMarkup;
  if (!m || !Number.isFinite(m.markup) || m.markup <= 0) return "Atur kurs dan markup dulu: markup belum diisi.";
  if (!Number.isFinite(p.roundTo) || p.roundTo < 1) return "Atur kurs dan markup dulu: pembulatan harga tidak valid.";
  return null;
}
const LIKEO_ID_FOR_PRICING = "prv_likeo";

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

export type SyncChange = {
  kind: "baru" | "naik" | "turun" | "dihapus";
  providerServiceId: string;
  localId: string | null;
  name: string;
  category: string;
  platform: string;
  /** Provider cost per 1000 in Rupiah, before and after. */
  oldCost: number;
  newCost: number;
  oldPrice: number;
  newPrice: number;
  margin: number | null;
  thinMargin: boolean;
  /** A service that had been switched off because the provider dropped it, and is listed again. */
  restored?: boolean;
};

export type UnsupportedService = { providerServiceId: string; name: string; type: string };

export type SyncPreview = {
  providerId: string;
  total: number;
  unchanged: number;
  changes: SyncChange[];
  unsupported: UnsupportedService[];
  fingerprint: string;
  rate: { currency: string; rateIdr: number };
  roundTo: number;
  /** Set while pricing is not configured: the modal shows it and does not offer "Terapkan". */
  blocked: string | null;
};

type Candidate = { info: ProviderServiceInfo; cost: number };

function supportedCandidates(items: ProviderServiceInfo[], rateIdr: number) {
  const seen = new Set<string>();
  const supported: Candidate[] = [];
  const unsupported: UnsupportedService[] = [];
  for (const info of items) {
    if (seen.has(info.id)) continue;
    seen.add(info.id);
    if (!isSupportedType(info.type)) { unsupported.push({ providerServiceId: info.id, name: cleanServiceName(info.name), type: info.type }); continue; }
    supported.push({ info, cost: rateToRupiah(info.rate, rateIdr) });
  }
  return { supported, unsupported };
}

const localFor = (db: AdminDb, providerId: string, providerServiceId: string) =>
  db.services.find((s) => s.providerId === providerId && s.providerServiceId === providerServiceId);

export function buildSyncPreview(db: AdminDb, providerId: string, items: ProviderServiceInfo[]): SyncPreview {
  const { rateIdr, currency, minMarginPercent, roundTo } = db.settings.pricing;
  const { supported, unsupported } = supportedCandidates(items, rateIdr);
  const changes: SyncChange[] = [];
  let unchanged = 0;

  for (const { info, cost } of supported) {
    const local = localFor(db, providerId, info.id);
    const category = cleanServiceName(info.category) || "Lainnya";
    if (!local) {
      const m = resolveMarkup(db, providerId, category);
      const candidate = { providerPrice: cost, ...m };
      changes.push({
        kind: "baru", providerServiceId: info.id, localId: null, name: cleanServiceName(info.name), category, platform: platformFromCategory(`${info.category} ${info.name}`),
        oldCost: 0, newCost: cost, oldPrice: 0, newPrice: finalPrice(candidate), margin: marginPercent(candidate), thinMargin: isThinMargin(candidate, minMarginPercent),
      });
      continue;
    }
    const restored = Boolean(local.providerRemoved);
    if (cost === local.providerPrice && !restored) { unchanged++; continue; }
    const next = { providerPrice: cost, markupType: local.markupType, markup: local.markup };
    if (restored && cost === local.providerPrice) {
      changes.push({ kind: "baru", restored: true, providerServiceId: info.id, localId: local.id, name: local.name, category: local.categoryLabel, platform: local.platform, oldCost: local.providerPrice, newCost: cost, oldPrice: finalPrice(local), newPrice: finalPrice(next), margin: marginPercent(next), thinMargin: isThinMargin(next, minMarginPercent) });
      continue;
    }
    changes.push({
      kind: cost > local.providerPrice ? "naik" : "turun", restored, providerServiceId: info.id, localId: local.id, name: local.name, category: local.categoryLabel, platform: local.platform,
      oldCost: local.providerPrice, newCost: cost, oldPrice: finalPrice(local), newPrice: finalPrice(next), margin: marginPercent(next), thinMargin: isThinMargin(next, minMarginPercent),
    });
  }

  // Imported services the provider no longer lists: switched off, never deleted.
  const listed = new Set(items.map((i) => i.id));
  for (const s of db.services) {
    if (s.providerId !== providerId || !s.imported || s.providerRemoved || listed.has(s.providerServiceId)) continue;
    changes.push({ kind: "dihapus", providerServiceId: s.providerServiceId, localId: s.id, name: s.name, category: s.categoryLabel, platform: s.platform, oldCost: s.providerPrice, newCost: 0, oldPrice: finalPrice(s), newPrice: 0, margin: null, thinMargin: false });
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ rateIdr, roundTo, c: changes.map((c) => [c.kind, c.providerServiceId, c.newCost, c.restored ?? false]) }))
    .digest("hex")
    .slice(0, 16);
  return { providerId, total: items.length, unchanged, changes, unsupported, fingerprint, rate: { currency, rateIdr }, roundTo, blocked: pricingProblem(db) };
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export type SyncResult = { created: number; raised: number; lowered: number; deactivated: number; restored: number; thinMargin: number };

/** Applies the catalogue to db.services. Idempotent: a second run with the same list changes nothing. */
export function applyCatalog(db: AdminDb, providerId: string, items: ProviderServiceInfo[], now = new Date()): SyncResult {
  const blocked = pricingProblem(db);
  if (blocked) throw new ServiceError(blocked, "pricing_not_configured");
  const { rateIdr, minMarginPercent } = db.settings.pricing;
  const { supported } = supportedCandidates(items, rateIdr);
  const result: SyncResult = { created: 0, raised: 0, lowered: 0, deactivated: 0, restored: 0, thinMargin: 0 };
  const at = now.toISOString();
  let nextId = Math.max(0, ...db.services.map((s) => Number(s.id) || 0)) + 1;
  let nextSort = Math.max(0, ...db.services.map((s) => s.sort)) + 1;

  for (const { info, cost } of supported) {
    const local = localFor(db, providerId, info.id);
    const category = cleanServiceName(info.category) || "Lainnya";
    if (!local) {
      const m = resolveMarkup(db, providerId, category);
      const created: AdminService = {
        id: String(nextId++), categoryId: `lk-${slugOf(category)}`, categoryLabel: category, platform: platformFromCategory(`${info.category} ${info.name}`),
        name: cleanServiceName(info.name), badges: [], providerId, providerServiceId: info.id, providerPrice: cost, markupType: m.markupType, markup: m.markup,
        min: info.min, max: info.max, refill: info.refill, refillDays: info.refill ? 30 : null, cancel: info.cancel, active: true, sort: nextSort++,
        providerName: info.name, providerType: info.type, providerRate: info.rate, syncedAt: at, imported: true,
      };
      // Never switch on a service that would sell for nothing.
      created.active = finalPrice(created) > 0 && created.providerPrice > 0;
      if (db.settings.pricing.autoAdjust && isThinMargin(created, minMarginPercent)) {
        const lifted = markupForMargin(created.providerPrice, minMarginPercent);
        created.markupType = lifted.markupType;
        created.markup = lifted.markup;
      }
      if (isThinMargin(created, minMarginPercent)) result.thinMargin++;
      db.services.push(created);
      result.created++;
      continue;
    }
    // Always refresh what the provider says about the service itself.
    local.min = info.min; local.max = info.max; local.refill = info.refill; local.cancel = info.cancel;
    local.providerName = info.name; local.providerType = info.type; local.providerRate = info.rate; local.syncedAt = at;
    if (local.providerRemoved) { local.providerRemoved = false; local.active = true; result.restored++; }
    if (cost !== local.providerPrice) {
      const old = finalPrice(local);
      const wasHigher = cost < local.providerPrice;
      local.providerPrice = cost;
      afterProviderPriceChange(db, local, old);
      if (wasHigher) result.lowered++; else result.raised++;
    }
    if (isThinMargin(local, minMarginPercent)) result.thinMargin++;
  }

  const listed = new Set(items.map((i) => i.id));
  for (const s of db.services) {
    if (s.providerId !== providerId || !s.imported || s.providerRemoved || listed.has(s.providerServiceId)) continue;
    s.active = false;
    s.providerRemoved = true;
    result.deactivated++;
  }
  logSystem(db, "provider.catalog_sync", "provider", providerId, null, result, now);
  return result;
}

// ---------------------------------------------------------------------------
// What users see
// ---------------------------------------------------------------------------

/** The one rule for "can a user see and order this": active, priced, not dropped by the provider, and its provider is active. */
export function isUserVisible(db: AdminDb, s: AdminService): boolean {
  if (!s.active || s.providerRemoved || !(finalPrice(s) > 0)) return false;
  const provider = db.providers.find((p) => p.id === s.providerId);
  return Boolean(provider) && !(provider!.kind && provider!.status === "nonaktif");
}

export type ServiceStages = {
  /** Services the provider returned (when known). */
  fetched: number | null;
  /** ...of which Default type (imported) and unsupported. */
  normalized: number | null;
  unsupported: number | null;
  /** Rows in the shared store (db.services) per origin. */
  stored: number;
  applied: number;
  active: number;
  /** What the user-side query returns. */
  visible: number;
  /** Why the rest is missing. */
  dropped: { inactive: number; removedByProvider: number; zeroPrice: number; providerMissingOrOff: number };
};

/** Counts at every stage of the path provider -> store -> user query. Pure; used by the dev log, the script and the tests. */
export function serviceStages(db: AdminDb, fetched?: ProviderServiceInfo[]): ServiceStages {
  const imported = db.services.filter((s) => s.imported);
  const dropped = { inactive: 0, removedByProvider: 0, zeroPrice: 0, providerMissingOrOff: 0 };
  let visible = 0;
  for (const s of imported) {
    if (isUserVisible(db, s)) { visible++; continue; }
    if (s.providerRemoved) dropped.removedByProvider++;
    else if (!s.active) dropped.inactive++;
    else if (!(finalPrice(s) > 0)) dropped.zeroPrice++;
    else dropped.providerMissingOrOff++;
  }
  const split = fetched ? supportedCandidates(fetched, db.settings.pricing.rateIdr) : null;
  return {
    fetched: fetched ? fetched.length : null, normalized: split ? split.supported.length : null, unsupported: split ? split.unsupported.length : null,
    stored: db.services.length, applied: imported.length, active: imported.filter((s) => s.active).length, visible, dropped,
  };
}

/** One server console line (dev only), e.g. after a preview, an apply and when the user catalogue is built. */
export function logStages(where: string, stages: ServiceStages): void {
  if (process.env.NODE_ENV === "production" || process.env.VITEST) return;
  const s = stages;
  const line = `[layanan] ${where}: dari provider=${s.fetched ?? "-"} dinormalisasi=${s.normalized ?? "-"} tidak didukung=${s.unsupported ?? "-"} | di store=${s.applied} aktif=${s.active} terlihat user=${s.visible} | dibuang: nonaktif=${s.dropped.inactive} dihapus provider=${s.dropped.removedByProvider} harga 0=${s.dropped.zeroPrice} provider hilang/nonaktif=${s.dropped.providerMissingOrOff}`;
  if (lastLogged.get(where) !== line) {
    lastLogged.set(where, line);
    console.info(line);
  }
}
const lastLogged = new Map<string, string>();

/** Imported services the user query returns, in the shape the user catalogue (order form, Layanan page) expects. Plain data only. */
export function buildUserCatalog(db: AdminDb): { categories: Category[]; services: Service[]; hiddenServiceIds: string[]; hiddenCategoryIds: string[] } {
  // Bundled demo services whose provider no longer exists (live mode) cannot be ordered: hide them from users too.
  const known = new Set(db.providers.map((p) => p.id));
  const hiddenServices = db.services.filter((s) => !s.imported && !known.has(s.providerId));
  const hiddenServiceIds = hiddenServices.map((s) => s.id);
  const hidden = new Set(hiddenServiceIds);
  const hiddenCategoryIds = [...new Set(hiddenServices.map((s) => s.categoryId))].filter((cid) => !db.services.some((s) => s.categoryId === cid && !hidden.has(s.id)));
  const active = db.services.filter((s) => s.imported && isUserVisible(db, s));
  const categories: Category[] = [];
  for (const s of active) {
    // A category always maps to a platform: unknown ones go under "Lainnya" so they still show under "Semua".
    if (!categories.some((c) => c.id === s.categoryId)) categories.push({ id: s.categoryId, platformId: s.platform || "lainnya", label: s.categoryLabel || "Lainnya" });
  }
  const services: Service[] = active.map((s) => ({
    id: s.id, categoryId: s.categoryId, name: s.name, badges: [], pricePer1000: finalPrice(s), min: s.min, max: s.max, speedPerHour: 0,
    startTime: "Bervariasi", refillDays: s.refill ? (s.refillDays ?? 30) : null, guarantee: s.refill ? "Garansi refill" : "Tanpa garansi",
    estimate: "Bervariasi", linkFormat: "https://", description: [s.providerName && s.providerName !== s.name ? `Nama asli di provider: ${s.providerName}` : s.name],
  }));
  logStages("katalog user", serviceStages(db));
  return { categories, services, hiddenServiceIds, hiddenCategoryIds };
}

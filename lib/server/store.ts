/**
 * Durable storage layer for the admin state that must survive a dev-server restart or hot reload:
 * admin 2FA (secrets are encrypted before they get here), pending 2FA setups, admin sessions, audit logs and
 * changed admin password hashes.
 *
 * Today this is a JSON file (`.data/dev-store.json`, gitignored). It is the ONLY place that touches the disk.
 * TODO(db): swap `createFileStore` for the real database (tables `admin_2fa`, `admin_sessions`, `audit_logs`,
 * see ./schema.sql). Nothing else in the app has to change.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { setPriceRounding, type AdminDb, type AdminService, type AuditLog, type ProviderRecord } from "@/lib/admin-data";
import { LIKEO_ID } from "./providers/config";
import { normalizeAnnouncement, type Announcement } from "@/lib/announcements-data";
import type { CancelPolicy, OrderRuleSet, RuleKey } from "@/lib/order-rules";
import { NOTIFICATION_TYPES, type AppNotification } from "@/lib/notifications-data";
import type { AdminSecurity, AdminSession, PendingTotp } from "./types";

/** Credentials and personal settings of a user (never sent to the client). */
export type UserAuthRecord = { passwordHash: string; prefs?: Record<string, Record<string, unknown>> };

export type PersistedState = {
  adminSecurity: Record<string, AdminSecurity>;
  pending2fa: Record<string, PendingTotp>;
  sessions: AdminSession[];
  auditLogs: AuditLog[];
  /** The announcements table: admin writes it, the user area reads it. */
  announcements: Announcement[];
  announcementSeen: Record<string, string>;
  /** What users accept before ordering, and the cancel policy: admin edits survive restarts. */
  orderRules: Record<RuleKey, OrderRuleSet>;
  cancelPolicy: CancelPolicy;
  /** The bell: shared by the user and the admin area. */
  notifications: AppNotification[];
  /** userId -> language ("id" | "en"): the `language` field of the profile. TODO(db): users.language column. */
  languages: Record<string, string>;
  /** Services imported from a provider, pricing settings (kurs, markup, rounding) and the real provider's switches. */
  importedServices: AdminService[];
  pricing: AdminDb["settings"]["pricing"];
  likeo: { status: ProviderRecord["status"]; lastTest: ProviderRecord["lastTest"]; balanceNative?: number; currency?: string; balance: number; balanceAt?: string | null; dataMode?: "mock" | "live" };
  /** Operational data: everything users and admins create. There is no database yet, so it lives here (and only here). */
  users: AdminDb["users"];
  orders: AdminDb["orders"];
  deposits: AdminDb["deposits"];
  refills: AdminDb["refills"];
  refunds: AdminDb["refunds"];
  tickets: AdminDb["tickets"];
  ledger: AdminDb["ledger"];
  refillRequests: AdminDb["refillRequests"];
  cancelRequests: AdminDb["cancelRequests"];
  syncRuns: AdminDb["syncRuns"];
  alerts: AdminDb["alerts"];
  priceUpdates: AdminDb["priceUpdates"];
  sanityRuns: AdminDb["sanityRuns"];
  outbox: AdminDb["outbox"];
  providerOrders: AdminDb["providerOrders"];
  /** userId -> { passwordHash, prefs }: user credentials and settings (kept apart from the public user record). */
  userAuth: Record<string, UserAuthRecord>;
  /** scrypt hashes of admin passwords that were changed in the panel. */
  adminPasswords: Record<string, string>;
  /** An encrypted known string: proves ADMIN_2FA_ENC_KEY is still the key the stored secrets were encrypted with. */
  keyCheck: string;
};

export interface Store {
  read(): Partial<PersistedState>;
  /** Merges the given keys into what is stored. */
  update(patch: Partial<PersistedState>): void;
  /** Removes everything (explicit reset only). */
  clear(): void;
  /** Changes whenever the stored data changes (file mtime / counter), so a running server can notice outside edits. */
  version(): number;
}

/** In-memory store: used by tests and when SG_STORE=memory. Never touches the disk. */
export function createMemoryStore(initial: Partial<PersistedState> = {}): Store {
  let data: Partial<PersistedState> = structuredClone(initial);
  let counter = 1;
  return {
    version: () => counter,
    read: () => structuredClone(data),
    update: (patch) => {
      data = { ...data, ...structuredClone(patch) };
      counter++;
    },
    clear: () => {
      data = {};
      counter++;
    },
  };
}

/** JSON file store. Writes go to a temp file first and are renamed in, so a crash never leaves half a file. */
export function createFileStore(path: string): Store {
  const read = (): Partial<PersistedState> => {
    try {
      return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Partial<PersistedState>) : {};
    } catch {
      // A corrupt file must not silently reset 2FA: keep it aside and start empty, loudly.
      console.error(`[store] ${path} tidak bisa dibaca. Periksa file ini sebelum menimpa.`);
      return {};
    }
  };
  return {
    read,
    version: () => (existsSync(path) ? statSync(path).mtimeMs : 0),
    update(patch) {
      mkdirSync(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ ...read(), ...patch }, null, 2), { mode: 0o600 });
      renameSync(tmp, path);
    },
    clear() {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, "{}", { mode: 0o600 });
    },
  };
}

const g = globalThis as unknown as { __sgStore?: Store; __sgSynced?: number };

/**
 * The shared store. Cached on globalThis so Next hot reload does not recreate it.
 * Tests (VITEST) and SG_STORE=memory get an isolated in-memory store.
 */
export function getStore(): Store {
  // (the typeof check recreates a store object cached by an older version of this module after a hot reload)
  if (!g.__sgStore || typeof g.__sgStore.version !== "function") {
    const memory = process.env.VITEST || process.env.NODE_ENV === "test" || process.env.SG_STORE === "memory";
    g.__sgStore = memory ? createMemoryStore() : createFileStore(process.env.SG_STORE_PATH ?? join(process.cwd(), ".data", "dev-store.json"));
  }
  return g.__sgStore;
}

/** Test helper: replace the shared store. */
export function setStore(store: Store | undefined) {
  g.__sgStore = store;
}

/** Copy persisted admin state into a freshly seeded db. Persisted data always wins over seed data. */
export function applyPersisted(db: AdminDb, store: Store = getStore()): boolean {
  const saved = store.read();
  if (saved.adminSecurity) db.adminSecurity = saved.adminSecurity;
  if (saved.pending2fa) db.pending2fa = saved.pending2fa;
  if (saved.sessions) db.sessions = saved.sessions;
  if (saved.auditLogs) db.auditLogs = saved.auditLogs;
  if (saved.announcements) db.announcements = saved.announcements.map((a) => normalizeAnnouncement(a as unknown as Record<string, unknown>));
  if (saved.announcementSeen) db.announcementSeen = saved.announcementSeen;
  // Rows written before the bell existed had another shape (message/read); keep only valid current ones.
  const validNotifications = (saved.notifications ?? []).filter(
      (n) => n && typeof n.id === "string" && typeof n.userId === "string" && NOTIFICATION_TYPES.includes(n.type) && typeof n.title === "string" && typeof n.createdAt === "string"
  );
  if (validNotifications.length) db.notifications = validNotifications;
  // Merge per platform so a rule set added later still has its default.
  if (saved.orderRules) db.settings.orderRules = { ...db.settings.orderRules, ...saved.orderRules };
  if (saved.cancelPolicy) db.settings.cancelPolicy = { ...db.settings.cancelPolicy, ...saved.cancelPolicy };
  for (const key of ["users", "orders", "deposits", "refills", "refunds", "tickets", "ledger", "refillRequests", "cancelRequests", "syncRuns", "alerts", "priceUpdates", "sanityRuns", "outbox"] as const) {
    if (Array.isArray(saved[key])) (db as unknown as Record<string, unknown>)[key] = saved[key];
  }
  if (saved.providerOrders) db.providerOrders = saved.providerOrders;
  if (saved.pricing) db.settings.pricing = { ...db.settings.pricing, ...saved.pricing };
  setPriceRounding(db.settings.pricing.roundTo);
  if (saved.importedServices?.length) db.services = [...db.services.filter((s) => !s.imported), ...saved.importedServices];
  if (saved.likeo) {
    const p = db.providers.find((x) => x.id === LIKEO_ID);
    if (p) Object.assign(p, saved.likeo);
  }
  return "adminSecurity" in saved;
}

/** Write the admin state of `db` to the store. Call after every change to 2FA, sessions or audit logs. */
export function persistAdminState(db: AdminDb, store: Store = getStore()) {
  store.update({ adminSecurity: db.adminSecurity, pending2fa: db.pending2fa, sessions: db.sessions, auditLogs: db.auditLogs.slice(0, 500), announcements: db.announcements, announcementSeen: db.announcementSeen, orderRules: db.settings.orderRules, cancelPolicy: db.settings.cancelPolicy, users: db.users, orders: db.orders, deposits: db.deposits, refills: db.refills, refunds: db.refunds, tickets: db.tickets, ledger: db.ledger,
    refillRequests: db.refillRequests, cancelRequests: db.cancelRequests, syncRuns: db.syncRuns.slice(0, 500), alerts: db.alerts.slice(0, 200), priceUpdates: db.priceUpdates.slice(0, 500),
    sanityRuns: db.sanityRuns.slice(0, 50), outbox: db.outbox.slice(0, 200), providerOrders: db.providerOrders,
    notifications: db.notifications, importedServices: db.services.filter((s) => s.imported), pricing: db.settings.pricing, likeo: likeoState(db) });
  if (store === g.__sgStore) g.__sgSynced = store.version(); // our own write: not an outside change
}

/**
 * True when the stored data was changed by someone else (for example `npm run admin:reset-2fa`) after this
 * process last wrote or read it. The caller then reloads with applyPersisted().
 */
export function changedOutside(store: Store = getStore()): boolean {
  if (g.__sgSynced === undefined) {
    // First look (e.g. after a hot reload of this module): the current file state is the baseline.
    g.__sgSynced = store.version();
    return false;
  }
  return store.version() !== g.__sgSynced;
}

export function markSynced(store: Store = getStore()) {
  g.__sgSynced = store.version();
}

function likeoState(db: AdminDb): PersistedState["likeo"] {
  const p = db.providers.find((x) => x.id === LIKEO_ID);
  return { status: p?.status ?? "aktif", lastTest: p?.lastTest ?? null, balanceNative: p?.balanceNative, currency: p?.currency, balance: p?.balance ?? 0, balanceAt: p?.balanceAt ?? null, dataMode: p?.dataMode };
}

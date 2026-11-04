/**
 * DEMO DATA SEED. Run with: npm run seed:demo [-- --force]
 *
 * Fills the dev store with FAKE users, orders, deposits, tickets, ledger and notifications so the screens can be explored
 * with data. Never runs in production. The running app never seeds anything by itself.
 *
 * It keeps what must survive: admin 2FA, sessions, audit logs, passwords, the Likeo provider row and the services imported
 * from the provider. Everything operational (users, orders, ...) is replaced. A backup of the store is written first.
 * Demo users sign in with the password printed at the end.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createEmptyDb } from "../lib/admin-data";
import { DEMO_PASSWORD, seedDemoDb } from "../lib/dev/demo-seed";
import { hashPassword } from "../lib/server/password";
import { applyPersisted, persistAdminState } from "../lib/server/store";
import { loadCreds, saveCreds } from "../lib/server/user-store";

if (process.env.NODE_ENV === "production") {
  console.error("seed:demo menolak berjalan saat NODE_ENV=production.");
  process.exit(1);
}

console.warn("PERINGATAN: ini mengisi store dev dengan data PALSU (pengguna, pesanan, deposit, tiket...). Jangan dipakai di data sungguhan.");

const storePath = join(process.cwd(), ".data", "dev-store.json");
const db = createEmptyDb();
applyPersisted(db);

if (db.users.length > 0 && !process.argv.includes("--force")) {
  console.error(`Store sudah berisi ${db.users.length} pengguna. Jalankan ulang dengan --force untuk menimpanya (backup dibuat dulu).`);
  process.exit(1);
}

if (existsSync(storePath)) {
  const dir = join(process.cwd(), ".data", `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  mkdirSync(dir, { recursive: true });
  copyFileSync(storePath, join(dir, "dev-store.json"));
  console.log("Backup store:", dir);
}

const demo = seedDemoDb();
// Replace operational data; keep admin security, sessions, logs, settings, the Likeo row and imported services.
Object.assign(db, {
  users: demo.users, orders: demo.orders, deposits: demo.deposits, refunds: demo.refunds, tickets: demo.tickets,
  ledger: demo.ledger, refillRequests: demo.refillRequests, cancelRequests: demo.cancelRequests, syncRuns: demo.syncRuns, alerts: demo.alerts,
  priceUpdates: demo.priceUpdates, providerOrders: demo.providerOrders, notifications: demo.notifications, announcements: demo.announcements,
});
const imported = db.services.filter((s) => s.imported);
db.services = [...demo.services.filter((s) => !s.imported), ...imported];
// Demo providers keep the demo services working; the Likeo row stays as configured.
db.providers = [...demo.providers.filter((p) => !p.kind), ...db.providers.filter((p) => p.kind)];

persistAdminState(db);
const creds = loadCreds();
const hash = hashPassword(DEMO_PASSWORD);
for (const u of demo.users) creds[u.id] = { passwordHash: hash };
saveCreds(creds);

console.log(`Selesai: ${demo.users.length} pengguna demo, ${demo.orders.length} pesanan, ${demo.deposits.length} deposit, ${demo.tickets.length} tiket.`);
console.log(`Masuk sebagai pengguna demo "jagoansosmed_user" (atau lainnya) dengan password: ${DEMO_PASSWORD}`);
console.log("Catatan: mode live menyembunyikan penyedia contoh; layanan demo baru tampil bila PROVIDER_MODE=mock.");

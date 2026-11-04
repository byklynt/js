// Dev-only: disable 2FA for one admin so they can set it up again.
//
//   npm run admin:reset-2fa -- <username>
//
// Refuses to run when NODE_ENV=production. Writes an audit log entry, clears the pending setup and revokes the
// admin's sessions. A running dev server notices the change on its next request (no restart needed).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

if (process.env.NODE_ENV === "production") {
  console.error("Ditolak: skrip ini tidak boleh dijalankan saat NODE_ENV=production.");
  process.exit(1);
}

const username = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!username) {
  console.error("Pemakaian: npm run admin:reset-2fa -- <username>");
  process.exit(1);
}

// The dev admin accounts live in lib/admin-data.ts (mockAdminAccounts). Read them from the source so there is one list.
const source = readFileSync(join(process.cwd(), "lib", "admin-data.ts"), "utf8");
const accounts = [...source.matchAll(/\{\s*id:\s*"(adm_\d+)",\s*username:\s*"([^"]+)"/g)].map((m) => ({ id: m[1], username: m[2] }));
const admin = accounts.find((a) => a.username.toLowerCase() === username.toLowerCase());
if (!admin) {
  console.error(`Admin "${username}" tidak ditemukan. Yang ada: ${accounts.map((a) => a.username).join(", ")}`);
  process.exit(1);
}

const path = process.env.SG_STORE_PATH ?? join(process.cwd(), ".data", "dev-store.json");
const data = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
const had = Boolean(data.adminSecurity?.[admin.id]?.enabled);

if (data.adminSecurity) delete data.adminSecurity[admin.id];
if (data.pending2fa) delete data.pending2fa[admin.id];
const now = new Date().toISOString();
let revoked = 0;
for (const s of data.sessions ?? []) {
  if (s.adminId === admin.id && !s.revokedAt) {
    s.revokedAt = now;
    revoked++;
  }
}
data.auditLogs = [
  {
    id: `log_cli_${Date.now().toString(36)}`,
    at: now,
    adminId: "cli",
    adminName: "cli (admin:reset-2fa)",
    action: "auth.2fa_reset_cli",
    targetType: "admin",
    targetId: admin.id,
    before: { enabled: had },
    after: { enabled: false, sessionsRevoked: revoked },
  },
  ...(data.auditLogs ?? []),
];

mkdirSync(dirname(path), { recursive: true });
const tmp = `${path}.${process.pid}.tmp`;
writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
renameSync(tmp, path);

console.log(`2FA untuk "${admin.username}" (${admin.id}) ${had ? "dinonaktifkan" : "memang belum aktif"}. ${revoked} sesi dicabut. Log audit ditulis.`);
console.log("Masuk lagi, lalu atur 2FA dari awal di /admin/setup-2fa.");

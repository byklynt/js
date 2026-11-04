// Dev store helper. Admin 2FA, sessions and audit logs live in .data/dev-store.json and are NEVER wiped by
// reseeding, hot reload or a dev-server restart. They are only removed when you ask for it explicitly:
//
//   npm run seed                 -> shows what is stored, changes nothing
//   npm run seed -- --reset      -> wipes .data/dev-store.json (admins must set up 2FA again)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const file = join(process.cwd(), ".data", "dev-store.json");
const reset = process.argv.includes("--reset");

if (reset) {
  mkdirSync(join(process.cwd(), ".data"), { recursive: true });
  writeFileSync(file, "{}", { mode: 0o600 });
  console.log("Dev store dikosongkan. Semua admin harus mengatur 2FA lagi.");
} else if (existsSync(file)) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  const admins = Object.entries(data.adminSecurity ?? {});
  console.log(`Dev store: ${file}`);
  console.log(`2FA aktif untuk: ${admins.filter(([, v]) => v.enabled).map(([id]) => id).join(", ") || "(tidak ada)"}`);
  console.log(`Sesi: ${(data.sessions ?? []).length}, log audit: ${(data.auditLogs ?? []).length}`);
  console.log("Tidak ada yang diubah. Tambahkan --reset untuk mengosongkan.");
} else {
  console.log("Belum ada dev store. File dibuat otomatis saat panel admin dipakai.");
}

/**
 * PERFORMANCE FIXTURE. Run with: npm run perf:seed
 *
 * Writes .data/perf-store.json with 5,000 SYNTHETIC imported services (about 780 categories, Likeo-like names, some with
 * no limit, double spaces and long names) so the services pages can be measured. It never touches .data/dev-store.json.
 * Start the server with SG_STORE_PATH=.data/perf-store.json, then run npm run perf:services.
 */
process.env.SG_STORE_PATH = process.env.SG_STORE_PATH ?? ".data/perf-store.json";
import { existsSync, mkdirSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
import { DEV_OWNER_TOTP_SECRET, createEmptyDb, type AdminService } from "../lib/admin-data";
import { encryptSecret } from "../lib/server/crypto-at-rest";
import { LIKEO_ID } from "../lib/server/providers/config";
import { persistAdminState } from "../lib/server/store";

if (process.env.NODE_ENV === "production") {
  console.error("perf:seed refuses to run when NODE_ENV=production.");
  process.exit(1);
}

mkdirSync(".data", { recursive: true });
const PLATFORMS = ["instagram", "tiktok", "youtube", "twitter", "facebook", "telegram", "spotify", "twitch", "reddit", "lainnya"];
const KINDS = ["Followers", "Likes", "Views", "Comments", "Shares", "Subscribers", "Reach", "Saves", "Live Stream Views", "Story Views"];
const QUALITY = ["Real Mix", "Non Drop", "HQ", "Instant", "Slow", "Indonesia", "Global", "Premium"];
const COUNT = Number(process.env.PERF_COUNT ?? 5000);
const CATEGORIES = 780;

const db = createEmptyDb();
const services: AdminService[] = [];
for (let i = 1; i <= COUNT; i++) {
  const c = i % CATEGORIES;
  const platform = PLATFORMS[c % PLATFORMS.length];
  const kind = KINDS[c % KINDS.length];
  const label = `${platform[0].toUpperCase()}${platform.slice(1)} ${kind} ${QUALITY[(c >> 2) % QUALITY.length]} #${c}`;
  const name = `${label}  |  ${QUALITY[i % QUALITY.length]}   Refill ${i % 3 === 0 ? "30D" : "No"} | Max ${((i % 9) + 1) * 10}K / Day`;
  services.push({
    id: String(1000 + i), categoryId: `cat-perf-${c}`, categoryLabel: label, platform, name, badges: [],
    providerId: LIKEO_ID, providerServiceId: String(5000 + i), providerPrice: 5000 + ((i * 37) % 90000), markupType: "persen", markup: 40,
    min: 10 * ((i % 10) + 1), max: i % 11 === 0 ? 2147483647 : 1000 * ((i % 50) + 1), refill: i % 3 === 0, refillDays: i % 3 === 0 ? 30 : null,
    cancel: i % 2 === 0, active: true, sort: i, providerName: name.replace(/\s+/g, " "), providerType: "Default", imported: true,
  });
}
db.services = services;
// So the admin pages can be measured too: the dev "owner" account gets its known dev 2FA secret (needs ADMIN_2FA_ENC_KEY in .env.local).
if (process.env.ADMIN_2FA_ENC_KEY) {
  db.adminSecurity.adm_2 = { secretEnc: encryptSecret(DEV_OWNER_TOTP_SECRET), enabled: true, enabledAt: new Date().toISOString(), backupHashes: [], lastUsedStep: 0 };
}
persistAdminState(db);
console.log(`Wrote ${services.length} synthetic services in ${CATEGORIES} categories to ${process.env.SG_STORE_PATH}.`);
console.log("Admin pages (production server): also set ADMIN_DEV_PASSWORD=admin12345; sign in as owner with the dev TOTP secret.");
console.log("Start: SG_STORE_PATH=" + process.env.SG_STORE_PATH + " npx next start -p 3100   then: npm run perf:services");

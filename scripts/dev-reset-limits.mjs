// Clears the rate-limit counters of the DEV project (login, signup, password reset, ticket and ticket reply keys).
//   npm run dev:reset-limits
// Refuses unless NEXT_PUBLIC_SUPABASE_URL is exactly the DEV project (SUPABASE_DEV_PROJECT_REF). Prints how many rows it removed per kind,
// never a key. If the service key is rejected it says so (a wrong key makes the app's limiter fail closed: "Terlalu banyak percobaan").
import { createClient } from "@supabase/supabase-js";
import { assertDevOnlyWithFile } from "./lib/prod-guard.mjs";

assertDevOnlyWithFile();

const KINDS = ["login", "signup", "reset", "ticket-reply", "ticket"];
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!key) {
  console.error("SUPABASE_SECRET_KEY (atau SUPABASE_SERVICE_ROLE_KEY) tidak ditemukan.");
  process.exit(1);
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, key, { auth: { persistSession: false, autoRefreshToken: false } });

let total = 0;
for (const kind of KINDS) {
  // "ticket:" must not swallow "ticket-reply:" (its own pass runs first), and "login:" is matched with the colon.
  const { data, error } = await sb.from("rate_limits").delete().like("key", `${kind}:*`).select("key");
  if (error) {
    const rejected = /invalid api key|jwt/i.test(error.message) || error.code === "PGRST301";
    console.error(`Gagal menghapus kunci ${kind}: ${error.message}${rejected ? "\nKey Supabase di .env.local ditolak oleh project DEV: cek SUPABASE_SERVICE_ROLE_KEY dan NEXT_PUBLIC_SUPABASE_ANON_KEY (harus milik project yang sama dengan URL)." : ""}`);
    process.exit(1);
  }
  console.log(`  ${kind}: ${data?.length ?? 0} dihapus`);
  total += data?.length ?? 0;
}
console.log(`dev:reset-limits selesai: ${total} baris rate_limits dihapus.`);

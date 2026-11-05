/**
 * LOCAL-ONLY demo data: npm run seed:demo
 *
 * Creates a few FAKE users, deposits and orders so the screens can be explored. It refuses to run unless
 * NEXT_PUBLIC_SUPABASE_URL points at the local Supabase stack (127.0.0.1 / localhost, `npm run db:start`). It will never touch
 * the dev or production project. The bootstrap (npm run bootstrap) is the only seed that is allowed to run anywhere.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#") && process.env[line.slice(0, i).trim()] === undefined) process.env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const host = (() => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
})();

if (!["127.0.0.1", "localhost", "::1", "host.docker.internal"].includes(host)) {
  console.error(`seed:demo menolak berjalan: NEXT_PUBLIC_SUPABASE_URL (${host || "kosong"}) bukan Supabase lokal. Data palsu hanya boleh ada di database LOKAL.`);
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("seed:demo menolak berjalan saat NODE_ENV=production.");
  process.exit(1);
}
if (!key) {
  console.error("SUPABASE_SECRET_KEY belum diisi.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const password = `Demo-${Math.random().toString(36).slice(2, 10)}!`;

async function main() {
  const { data: services } = await db.from("services").select("id,min").eq("active", true).limit(3);
  for (const name of ["demo_budi", "demo_sari", "demo_andi"]) {
    const { data, error } = await db.auth.admin.createUser({ email: `${name}@contoh.test`, password, email_confirm: true, user_metadata: { username: name } });
    if (error || !data.user) {
      console.log(`${name}: dilewati (${error?.message ?? "gagal"})`);
      continue;
    }
    await db.rpc("apply_ledger_entry", { p_user: data.user.id, p_type: "deposit", p_amount: 250_000, p_ref_type: "demo", p_ref_id: `demo:${data.user.id}`, p_note: "Saldo demo", p_by: "seed" });
    for (const [i, s] of (services ?? []).entries()) {
      await db.rpc("place_order", { p_user: data.user.id, p_service: s.id, p_link: `https://contoh.test/${name}/${i}`, p_quantity: s.min });
    }
    console.log(`${name}: dibuat`);
  }
  console.log(`Password semua akun demo: ${password}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

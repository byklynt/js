// Dev only: npm run services:check [-- --offline]
// Prints how many services exist at every stage of the path provider -> store -> user query, and the first 5 services.
// Reads the dev store (.data/dev-store.json); calls Likeo only to count (add --offline to skip the network). Never prints the key.
import { existsSync, readFileSync } from "node:fs";

for (const f of [".env.development.local", ".env.local", ".env.development", ".env"]) if (existsSync(f)) process.loadEnvFile(f);

const offline = process.argv.includes("--offline");
const mode = (process.env.PROVIDER_MODE ?? "").trim().replace(/^["']|["']$/g, "").toLowerCase() === "live" ? "live" : "mock";
const key = (process.env.LIKEO_API_KEY ?? "").trim();
const keySet = key !== "" && key !== "isi_api_key_likeo_di_sini";
const url = (process.env.LIKEO_API_URL ?? "").trim() || "https://likeo.net/api/v2";

const store = existsSync(".data/dev-store.json") ? JSON.parse(readFileSync(".data/dev-store.json", "utf8")) : {};
const pricing = { rateIdr: 16000, roundTo: 1, ...(store.pricing ?? {}) };
const imported = Array.isArray(store.importedServices) ? store.importedServices : [];
const likeoOff = store.likeo?.status === "nonaktif";

const finalPrice = (s) => {
  const raw = s.markupType === "persen" ? s.providerPrice * (1 + s.markup / 100) : s.providerPrice + s.markup;
  const clean = Math.round(raw * 10000) / 10000;
  const step = pricing.roundTo >= 1 ? Math.floor(pricing.roundTo) : 1;
  return Math.max(step, Math.ceil(clean / step) * step);
};
const idr = (n) => `Rp ${Number(n).toLocaleString("id-ID")}`;

console.log(`mode=${mode} | key terisi=${keySet} | url=${url}`);
console.log(`kurs=${pricing.rateIdr} ${pricing.currency ?? "USD"} | pembulatan=${pricing.roundTo} | markup provider=${JSON.stringify(pricing.providerMarkups?.prv_likeo ?? pricing.defaultMarkup ?? "(default 40%)")}`);
console.log("");

// stage 1-2: provider
if (offline || !keySet) {
  console.log(`1) dari provider      : (dilewati${offline ? ": --offline" : ": tidak ada API key"})`);
} else {
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ key, action: "services" }).toString(), redirect: "manual", signal: AbortSignal.timeout(20000) });
    const body = await res.text();
    const list = JSON.parse(body);
    if (!Array.isArray(list)) throw new Error(`bukan daftar: ${String(body).slice(0, 120).split(key).join("***")}`);
    const supported = list.filter((s) => String(s.type ?? "Default").trim().toLowerCase() === "default");
    console.log(`1) dari provider      : ${list.length} (HTTP ${res.status})`);
    console.log(`2) dinormalisasi      : ${supported.length} bertipe Default, ${list.length - supported.length} tidak didukung`);
  } catch (e) {
    console.log(`1) dari provider      : GAGAL ${String(e?.message ?? e).split(key).join("***").slice(0, 160)}`);
  }
}

// stage 3-5: store
const active = imported.filter((s) => s.active);
const priced = imported.filter((s) => finalPrice(s) > 0);
const visible = imported.filter((s) => s.active && !s.providerRemoved && finalPrice(s) > 0 && !likeoOff);
const mapped = imported.filter((s) => s.categoryLabel && s.platform);
console.log(`3) diterapkan (store) : ${imported.length}`);
console.log(`4) aktif              : ${active.length}  (nonaktif: ${imported.length - active.length}, dihapus provider: ${imported.filter((s) => s.providerRemoved).length}, harga 0: ${imported.length - priced.length})`);
console.log(`5) terlihat oleh user : ${visible.length}${likeoOff ? "  (provider Likeo dinonaktifkan)" : ""}  | kategori terpetakan: ${mapped.length}/${imported.length}`);
if (mode === "live") console.log("   catatan: di mode live layanan contoh bawaan disembunyikan; hanya layanan hasil sinkron yang muncul.");
if (imported.length === 0) console.log("\n>> Belum ada layanan di store. Buka /admin/services > Sinkronkan dari provider > Terapkan.");

console.log("\n5 layanan pertama:");
for (const s of imported.slice(0, 5)) {
  console.log(`  #${s.id} | ${s.name} | ${s.categoryLabel} | modal ${idr(s.providerPrice)} | jual ${idr(finalPrice(s))} | aktif=${s.active}`);
}

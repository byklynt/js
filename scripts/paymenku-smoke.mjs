// Manual SANDBOX smoke test of Paymenku (DEV only). Nothing here touches our database: it talks to Paymenku with the sandbox key only.
//   node scripts/paymenku-smoke.mjs                 channels, fee quote, create a Rp 1.000+ QRIS transaction, check it, print the simulator link
//   node scripts/paymenku-smoke.mjs --wait          then wait (up to 5 minutes) for you to open the simulator link and mark it paid
//   node scripts/paymenku-smoke.mjs --cancel        cancel the transaction at the end
// Refuses to run unless PAYMENKU_API_KEY is a sk_test_ key AND NEXT_PUBLIC_SUPABASE_URL is the DEV project. A sk_live_ key is always refused here.
// The key is never printed. Needs PAYMENKU_API_KEY in .env.local (or the session); PAYMENKU_API_BASE is honoured only for a local fake gateway.
import { assertDevOnlyWithFile } from "./lib/prod-guard.mjs";

assertDevOnlyWithFile(); // loads .env.local, refuses unless the Supabase URL is the DEV project
const key = (process.env.PAYMENKU_API_KEY ?? "").trim();
if (!key) {
  console.error("PAYMENKU_API_KEY belum diisi (kunci sandbox sk_test_ dari Dashboard Paymenku > Settings > API Keys).");
  process.exit(1);
}
if (key.startsWith("sk_live_")) {
  console.error("DITOLAK: ini kunci LIVE (sk_live_). Skrip smoke test hanya untuk kunci sandbox (sk_test_) dan hanya di DEV.");
  process.exit(1);
}
if (!key.startsWith("sk_test_")) {
  console.error("DITOLAK: format kunci tidak dikenal (harus sk_test_).");
  process.exit(1);
}
const base = (process.env.PAYMENKU_API_BASE || "https://paymenku.com/api/v1").replace(/\/+$/, "");
const args = process.argv.slice(2);
const mask = (t) => String(t).split(key).join("sk_test_***");

async function call(method, path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: res.status, headers: res.headers, json, text: mask(text.slice(0, 300)) };
}
const line = (ok, name, detail = "") => console.log(`${ok ? "OK    " : "GAGAL "} ${name}${detail ? `  ${detail}` : ""}`);
let failed = 0;
const check = (ok, name, detail) => {
  line(ok, name, detail);
  if (!ok) failed++;
};

console.log(`Paymenku sandbox smoke test -> ${base}\n`);

// 1) channels
const ch = await call("GET", "/payment-channels");
const channels = Array.isArray(ch.json?.data) ? ch.json.data : [];
check(ch.status === 200 && channels.length > 0, "Daftar kanal", `HTTP ${ch.status}, ${channels.length} kanal: ${channels.map((c) => `${c.code}(${c.fee_mode})`).join(", ")}`);
const channel = channels.find((c) => c.code === "qris") ?? channels[0];
if (!channel) process.exit(1);
console.log(`  dipakai: ${channel.code}, fee_mode ${channel.fee_mode}, fee ${channel.fee_flat} + ${channel.fee_percent}%, batas ${channel.min_amount} - ${channel.max_amount}\n`);

// 2) fee quote
const amount = Math.max(1000, Number(channel.min_amount) || 1000);
const fee = await call("GET", `/merchant/fee-calculator?amount=${amount}&code=${encodeURIComponent(channel.code)}`);
const quote = (Array.isArray(fee.json?.data) ? fee.json.data : [fee.json?.data]).find((r) => r?.code === channel.code);
check(fee.status === 200 && Boolean(quote?.total_fee), "Hitung fee", `HTTP ${fee.status}, biaya pelanggan ${quote?.total_fee?.customer}, biaya merchant ${quote?.total_fee?.merchant}`);

// 3) create (the Idempotency-Key = reference, exactly like the app)
const ref = `smoke-${Date.now()}`;
const create = await call("POST", "/transaction/create", { channel_code: channel.code, amount, reference_id: ref, customer_name: "Uji Smoke", customer_email: "smoke@example.com", return_url: "http://localhost:3000/deposit/smoke" }, { "Idempotency-Key": ref });
const tx = create.json?.data;
check(create.status === 200 && Boolean(tx?.trx_id), "Buat transaksi", `HTTP ${create.status}, trx ${tx?.trx_id}, nominal bayar ${tx?.amount} (nominal dasar ${amount})`);
if (!tx) {
  console.error(create.text);
  process.exit(1);
}
check(String(tx.trx_id).startsWith("SBOX"), "Transaksi bertanda SANDBOX (prefix SBOX)", tx.trx_id);
check(/^\d+\.\d{2}$/.test(String(tx.amount)), "Nominal berupa string desimal", String(tx.amount));
const info = tx.payment_info ?? {};
console.log(`  payment_info: ${Object.keys(info).join(", ")}`);
console.log(`  kedaluwarsa : ${info.expiration_date ?? "(tidak ada)"}`);
if (info.simulator_url) console.log(`  simulator   : ${info.simulator_url}`);

// 4) idempotent replay of the same create must not make a second transaction
const again = await call("POST", "/transaction/create", { channel_code: channel.code, amount, reference_id: ref, customer_name: "Uji Smoke", customer_email: "smoke@example.com", return_url: "http://localhost:3000/deposit/smoke" }, { "Idempotency-Key": ref });
check(again.json?.data?.trx_id === tx.trx_id, "Idempotency-Key: kirim ulang menghasilkan transaksi yang sama", `replayed=${again.headers.get("idempotency-replayed")}`);

// 5) check-status by trx_id and by reference_id
for (const id of [tx.trx_id, ref]) {
  const st = await call("GET", `/check-status/${encodeURIComponent(id)}`);
  check(st.status === 200 && st.json?.data?.status === "pending", `Cek status (${id === ref ? "reference_id" : "trx_id"})`, `HTTP ${st.status}, status ${st.json?.data?.status}, is_sandbox ${st.json?.data?.is_sandbox}, amount ${st.json?.data?.amount}, total_fee ${st.json?.data?.total_fee}, amount_received ${st.json?.data?.amount_received}`);
}

// 6) optionally wait for the simulator
if (args.includes("--wait")) {
  console.log("\nBuka simulator_url di atas lalu tandai lunas. Menunggu sampai 5 menit...");
  const until = Date.now() + 5 * 60_000;
  let status = "pending";
  while (Date.now() < until && status === "pending") {
    await new Promise((r) => setTimeout(r, 4000));
    status = (await call("GET", `/check-status/${encodeURIComponent(tx.trx_id)}`)).json?.data?.status ?? "?";
  }
  const final = (await call("GET", `/check-status/${encodeURIComponent(tx.trx_id)}`)).json?.data ?? {};
  check(status === "paid", "Status akhir paid", `status ${status}, paid_at ${final.paid_at}, amount ${final.amount}, total_fee ${final.total_fee}, amount_received ${final.amount_received}`);
}

// 7) optionally cancel
if (args.includes("--cancel")) {
  const c = await call("POST", "/transaction/cancel", { trx_id: tx.trx_id });
  check(c.status === 200, "Batalkan transaksi (sandbox)", `HTTP ${c.status} ${c.json?.message ?? c.text}`);
}

console.log(failed ? `\n${failed} pemeriksaan gagal.` : "\nSemua pemeriksaan lulus.");
process.exit(failed ? 1 : 0);

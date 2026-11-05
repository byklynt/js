// One-time script: creates the FIRST admin (or promotes an existing account) with the service role.
//   npm run admin:create -- <username> <email>
// The password is read from the ADMIN_CREATE_PASSWORD environment variable, or typed at a hidden prompt.
// It is never printed, never written to a file, and an existing admin is never reset.
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import readline from "node:readline";

function loadEnv() {
  const out = {};
  if (!existsSync(".env.local")) return out;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = line.indexOf("=");
    if (i > 0 && !line.trim().startsWith("#")) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function askHidden(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const write = rl._writeToOutput;
    rl._writeToOutput = (s) => {
      if (s.startsWith(prompt)) write.call(rl, s);
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

const [username, email] = process.argv.slice(2);
if (!username || !email) {
  console.error("Pemakaian: npm run admin:create -- <username> <email>");
  process.exit(1);
}
if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
  console.error("Username 3-20 karakter: huruf, angka, atau garis bawah.");
  process.exit(1);
}
if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
  console.error("Format email tidak valid.");
  process.exit(1);
}

const env = { ...loadEnv(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SECRET_KEY (atau SUPABASE_SERVICE_ROLE_KEY) harus ada di .env.local.");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const existing = await db.from("profiles").select("id,role,username").or(`username.eq.${username},email.eq.${email}`).maybeSingle();
if (existing.data?.role === "admin") {
  console.error(`Akun ${existing.data.username} sudah admin. Tidak ada yang diubah (admin yang ada tidak pernah direset oleh skrip ini).`);
  process.exit(1);
}

let userId = existing.data?.id;
if (userId) {
  console.log(`Akun ${existing.data.username} sudah ada sebagai ${existing.data.role}. Dijadikan admin; password tidak diubah.`);
} else {
  const password = env.ADMIN_CREATE_PASSWORD || (process.stdin.isTTY ? await askHidden("Password admin (min 12 karakter, tidak ditampilkan): ") : "");
  if (!password || password.length < 12) {
    console.error("Password minimal 12 karakter (isi ADMIN_CREATE_PASSWORD atau ketik di prompt).");
    process.exit(1);
  }
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { username } });
  if (error || !data.user) {
    console.error("Gagal membuat akun:", error?.message ?? "tidak diketahui");
    process.exit(1);
  }
  userId = data.user.id;
}

const { error } = await db.from("profiles").update({ role: "admin" }).eq("id", userId);
if (error) {
  console.error("Gagal menetapkan role admin:", error.message);
  process.exit(1);
}
await db.from("audit_logs").insert({ admin_id: userId, admin_name: username, action: "admin.bootstrap", target_type: "admin", target_id: userId, before: null, after: { role: "admin" } });
console.log(`Admin siap: ${username} <${email}>. Masuk di /admin/login lalu aktifkan verifikasi dua langkah.`);

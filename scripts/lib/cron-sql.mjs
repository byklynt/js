// Pure helpers for scripts/cron-admin.mjs (unit tested in lib/server/__tests__/cron.test.ts).
import { readFileSync } from "node:fs";

/** HTTPS only, no credentials, no query string, no fragment. Returns the origin + path without a trailing slash. */
export function normalizeAppUrl(input) {
  let u;
  try {
    u = new URL(String(input ?? "").trim());
  } catch {
    throw new Error("URL aplikasi tidak valid.");
  }
  if (u.protocol !== "https:") throw new Error("URL aplikasi harus HTTPS (pg_net tidak boleh memanggil http, dan rahasia tidak boleh lewat koneksi tanpa enkripsi).");
  if (u.username || u.password) throw new Error("URL aplikasi tidak boleh memuat username/password.");
  if (u.search || u.hash) throw new Error("URL aplikasi tidak boleh memuat query atau fragment.");
  if (["localhost", "127.0.0.1", "::1"].includes(u.hostname) || u.hostname.endsWith(".local")) throw new Error("URL harus publik: Supabase tidak bisa menjangkau alamat lokal. Untuk lokal pakai `npm run dev:cron`.");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

/** A SQL string literal: single quotes doubled; control characters are refused. */
export function sqlLiteral(value) {
  const s = String(value);
  if (/[\u0000-\u001f]/.test(s)) throw new Error("Nilai berisi karakter kontrol.");
  return `'${s.replace(/'/g, "''")}'`;
}

/** SQL that upserts the two Vault secrets (create or update by name). */
export function vaultUpsertSql({ appUrl, secret }) {
  const one = (name, value, description) => `do $v$
declare sid uuid;
begin
  select id into sid from vault.decrypted_secrets where name = ${sqlLiteral(name)};
  if sid is null then perform vault.create_secret(${sqlLiteral(value)}, ${sqlLiteral(name)}, ${sqlLiteral(description)});
  else perform vault.update_secret(sid, ${sqlLiteral(value)}, ${sqlLiteral(name)}, ${sqlLiteral(description)}); end if;
end $v$;`;
  return [one("jago_app_url", appUrl, "JagoanSosmed public URL (cron)"), one("jago_cron_secret", secret, "JagoanSosmed CRON_SECRET (cron)")].join("\n");
}

export function buildEnableSql({ appUrl, secret, enableFile = "supabase/cron/enable-cron.sql" }) {
  if (!secret || String(secret).length < 24) throw new Error("CRON_SECRET harus diisi dan minimal 24 karakter.");
  return `${vaultUpsertSql({ appUrl: normalizeAppUrl(appUrl), secret })}\n${readFileSync(enableFile, "utf8")}`;
}

export const purgeSecretsSql = `do $p$ begin delete from vault.secrets where name in ('jago_app_url', 'jago_cron_secret'); end $p$;`;

/** The same text with every secret value replaced, safe to print. */
export function redact(sql, secret) {
  return secret ? sql.split(String(secret)).join("[CRON_SECRET]") : sql;
}

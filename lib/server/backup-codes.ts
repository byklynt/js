import "server-only";
import { randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/** Supabase MFA has no backup codes, so ours live in admin_backup_codes (scrypt hashes, single use). */
export const BACKUP_CODE_COUNT = 10;
export const BACKUP_CODE_RE = /^[a-z0-9]{4}-[a-z0-9]{4}$/i;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function makeCode(): string {
  const bytes = randomBytes(8);
  const pick = (i: number) => ALPHABET[bytes[i] % ALPHABET.length];
  return `${[0, 1, 2, 3].map(pick).join("")}-${[4, 5, 6, 7].map(pick).join("")}`;
}

/** Replaces all codes of an admin with a fresh set; returns the plain codes (shown once). */
export async function issueBackupCodes(adminId: string): Promise<string[]> {
  const db = supabaseAdmin();
  await db.from("admin_backup_codes").delete().eq("admin_id", adminId);
  const codes = Array.from({ length: BACKUP_CODE_COUNT }, makeCode);
  const { error } = await db.from("admin_backup_codes").insert(codes.map((c) => ({ admin_id: adminId, code_hash: hashPassword(c.toLowerCase()) })));
  if (error) throw new Error(`backup codes: ${error.message}`);
  return codes;
}

export async function backupCodesLeft(adminId: string): Promise<number> {
  const { count } = await supabaseAdmin().from("admin_backup_codes").select("id", { count: "exact", head: true }).eq("admin_id", adminId).is("used_at", null);
  return count ?? 0;
}

/** True and consumes the code when it matches an unused one. */
export async function consumeBackupCode(adminId: string, code: string): Promise<boolean> {
  const db = supabaseAdmin();
  const { data } = await db.from("admin_backup_codes").select("id,code_hash").eq("admin_id", adminId).is("used_at", null);
  const candidate = code.trim().toLowerCase();
  for (const row of data ?? []) {
    if (verifyPassword(candidate, row.code_hash)) {
      const { data: updated } = await db.from("admin_backup_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id).is("used_at", null).select("id");
      return (updated?.length ?? 0) === 1; // a parallel use of the same code loses the race
    }
  }
  return false;
}

export async function clearBackupCodes(adminId: string) {
  await supabaseAdmin().from("admin_backup_codes").delete().eq("admin_id", adminId);
}

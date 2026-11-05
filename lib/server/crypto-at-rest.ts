/** AES-256-GCM for secrets stored at rest (the TOTP secret). Format: base64(iv).base64(tag).base64(ciphertext). */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Fails loudly: there is no fallback key, because a default key would make the encryption pointless. */
export function getEncKey(): Buffer {
  const raw = process.env.ADMIN_2FA_ENC_KEY;
  if (!raw) throw new Error("ADMIN_2FA_ENC_KEY belum diatur. Buat dengan: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
  const decoded = Buffer.from(raw, "base64");
  // Accept a 32-byte base64 key as is; hash anything else down to 32 bytes.
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string, key: Buffer = getEncKey()): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(payload: string, key: Buffer = getEncKey()): string {
  const [iv, tag, enc] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !enc) throw new Error("Format rahasia tidak valid.");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Key for provider API keys stored in providers.api_key_encrypted (PROVIDER_KEY_ENC_KEY, separate from the 2FA key). */
export function getProviderEncKey(): Buffer {
  const raw = process.env.PROVIDER_KEY_ENC_KEY;
  if (!raw) throw new Error("PROVIDER_KEY_ENC_KEY belum diatur. Buat dengan: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
  const decoded = Buffer.from(raw, "base64");
  return decoded.length === 32 ? decoded : createHash("sha256").update(raw).digest();
}

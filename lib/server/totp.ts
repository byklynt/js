/** RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30s) and one-time backup codes. Works with any authenticator app. */
import { OTP_ISSUER } from "@/lib/brand";
import { createHmac, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of text.replace(/=+$/, "").toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export const generateSecret = () => base32Encode(randomBytes(20));

export function totpAt(secret: string, timeMs: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 30_000)));
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const code = ((hmac[offset] & 127) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

/** The 30-second counter for a timestamp (RFC 6238, T0 = 0). */
export const totpStep = (timeMs: number) => Math.floor(timeMs / 30_000);

/** The time step (30s counter) a code belongs to, accepting one step either side of now; null if it matches none. */
export function matchTotpStep(secret: string, code: string, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  for (const offset of [0, -1, 1]) {
    const t = now + offset * 30_000;
    if (totpAt(secret, t) === code) return Math.floor(t / 30_000);
  }
  return null;
}

/** Accepts the current code and one step either side (clock drift). */
export function verifyTotp(secret: string, code: string, now = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  return [-1, 0, 1].some((step) => totpAt(secret, now + step * 30_000) === code);
}

export const otpauthUrl = (secret: string, account: string, issuer = OTP_ISSUER) =>
  `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;

const hashCode = (code: string, salt: string) => `${salt}:${scryptSync(code, salt, 32).toString("hex")}`;

/** 8 single-use codes like "a1b2-c3d4". Show the plain codes once; keep only the hashes. */
export function generateBackupCodes(count = 10): { plain: string[]; hashes: string[] } {
  const plain = Array.from({ length: count }, () => {
    const raw = Array.from({ length: 8 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[randomInt(31)]).join("");
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
  return { plain, hashes: plain.map((c) => hashCode(c, randomBytes(8).toString("hex"))) };
}

/** Returns the remaining hashes when the code matched (and was consumed), or null. */
export function consumeBackupCode(hashes: string[], code: string): string[] | null {
  const normalized = code.trim().toLowerCase();
  for (let i = 0; i < hashes.length; i++) {
    const [salt, hex] = hashes[i].split(":");
    const candidate = scryptSync(normalized, salt, 32);
    const expected = Buffer.from(hex, "hex");
    if (expected.length === candidate.length && timingSafeEqual(candidate, expected)) return hashes.filter((_, j) => j !== i);
  }
  return null;
}

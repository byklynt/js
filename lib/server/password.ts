import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** scrypt password hashing shared by admin and user accounts. Format: "salt:hash" (hex). No server-only: usable in tests. */
const KEYLEN = 64;

export function hashPassword(password: string, salt: string = randomBytes(16).toString("hex")): string {
  return `${salt}:${scryptSync(password, salt, KEYLEN).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && timingSafeEqual(candidate, expected);
}

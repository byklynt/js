/** Pure access rules: 2FA gate, IP allowlist, maintenance mode, re-authentication. */
import type { AdminSecurity, AdminSession } from "./types";

/** Admin may use the panel only with 2FA enabled when the site requires it. */
export function twoFactorGate(requireAdmin2fa: boolean, security: AdminSecurity | undefined): "ok" | "setup_required" {
  if (!requireAdmin2fa) return "ok";
  return security?.enabled ? "ok" : "setup_required";
}

function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
}

const normalizeIp = (ip: string) => (ip === "::1" || ip === "::ffff:127.0.0.1" ? "127.0.0.1" : ip.replace(/^::ffff:/, ""));

/** Empty list = allowlist off. Entries are exact IPs or IPv4 CIDR ("203.0.113.0/24"). */
export function ipAllowed(allowlist: string[], ip: string): boolean {
  if (allowlist.length === 0) return true;
  const me = normalizeIp(ip);
  return allowlist.some((entry) => {
    const [base, bits] = entry.trim().split("/");
    if (bits === undefined) return normalizeIp(base) === me;
    const a = ipToInt(normalizeIp(base));
    const b = ipToInt(me);
    const n = Number(bits);
    if (a === null || b === null || !Number.isInteger(n) || n < 0 || n > 32) return false;
    const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
    return (a & mask) === (b & mask);
  });
}

export const isValidAllowlistEntry = (entry: string) => {
  const [base, bits] = entry.trim().split("/");
  if (ipToInt(base) === null) return false;
  return bits === undefined || (Number.isInteger(Number(bits)) && Number(bits) >= 0 && Number(bits) <= 32);
};

/** Maintenance mode blocks users, never admins. */
export function maintenanceBlocks(maintenance: boolean, role: "user" | "admin" | null): boolean {
  return maintenance && role !== "admin";
}

/** Money actions need the admin's password again. `verify` is the real credential check. */
export function requireReauth(verify: (password: string) => boolean, password: string | undefined): boolean {
  return Boolean(password) && verify(password as string);
}

export const isSessionActive = (s: AdminSession | undefined) => Boolean(s && !s.revokedAt);

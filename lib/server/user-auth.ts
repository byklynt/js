/**
 * User accounts: sign-up, credential check, password / e-mail change, personal settings.
 * Pure over `db` + the credential map (db is the in-memory store, credentials live in the dev store: lib/server/store.ts).
 * TODO(db): tables `users` (+ password_hash) and `user_settings`; the lookups below become queries.
 */
import type { AdminDb, AdminUser } from "@/lib/admin-data";
import { hashPassword, verifyPassword } from "./password";
import type { UserAuthRecord } from "./store";
import { ServiceError } from "./tx";

export type Credentials = Record<string, UserAuthRecord>;

export const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;

const norm = (s: string) => s.trim().toLowerCase();

export function findUserByIdentifier(db: AdminDb, identifier: string): AdminUser | undefined {
  const needle = norm(identifier);
  return db.users.find((u) => norm(u.username) === needle || norm(u.email) === needle);
}

export function nextUserId(db: AdminDb): string {
  const max = db.users.reduce((n, u) => Math.max(n, Number(u.id.replace("usr_", "")) || 0), 1000);
  return `usr_${max + 1}`;
}

export function registerUser(
  db: AdminDb, creds: Credentials, input: { username: string; email: string; password: string }, now = new Date()
): AdminUser {
  const username = input.username.trim();
  const email = input.email.trim();
  if (!USERNAME_RE.test(username)) throw new ServiceError("Username 3-20 karakter: huruf, angka, atau garis bawah.", "bad_username");
  if (!EMAIL_RE.test(email)) throw new ServiceError("Format email tidak valid.", "bad_email");
  if (input.password.length < MIN_PASSWORD) throw new ServiceError(`Password minimal ${MIN_PASSWORD} karakter.`, "weak_password");
  if (db.users.some((u) => norm(u.username) === norm(username))) throw new ServiceError("Username sudah dipakai.", "username_taken");
  if (db.users.some((u) => norm(u.email) === norm(email))) throw new ServiceError("Email sudah terdaftar.", "email_taken");
  const user: AdminUser = {
    id: nextUserId(db), username, email, balance: 0, totalSpent: 0, rank: "Starter", status: "aktif", reseller: false,
    createdAt: now.toISOString(), notes: [], manualApproval: false,
  };
  db.users.push(user);
  creds[user.id] = { passwordHash: hashPassword(input.password) };
  return user;
}

const DUMMY = hashPassword("dummy-password-for-timing", "0".repeat(32));

/** Returns the user when identifier + password match. Always spends the same time, never says which part was wrong. */
export function verifyUserLogin(db: AdminDb, creds: Credentials, identifier: string, password: string): AdminUser | null {
  const user = findUserByIdentifier(db, identifier);
  const stored = user ? creds[user.id]?.passwordHash : undefined;
  const ok = verifyPassword(password, stored ?? DUMMY);
  return user && stored && ok ? user : null;
}

export function changeUserPassword(db: AdminDb, creds: Credentials, userId: string, current: string, next: string) {
  const rec = creds[userId];
  if (!rec || !verifyPassword(current, rec.passwordHash)) throw new ServiceError("Password saat ini salah.", "bad_password");
  if (next.length < MIN_PASSWORD) throw new ServiceError(`Password baru minimal ${MIN_PASSWORD} karakter.`, "weak_password");
  if (verifyPassword(next, rec.passwordHash)) throw new ServiceError("Password baru harus berbeda dari yang lama.", "same_password");
  rec.passwordHash = hashPassword(next);
}

export function changeUserEmail(db: AdminDb, creds: Credentials, userId: string, password: string, email: string) {
  const user = db.users.find((u) => u.id === userId);
  const rec = creds[userId];
  if (!user || !rec || !verifyPassword(password, rec.passwordHash)) throw new ServiceError("Password salah.", "bad_password");
  const next = email.trim();
  if (!EMAIL_RE.test(next)) throw new ServiceError("Format email tidak valid.", "bad_email");
  if (db.users.some((u) => u.id !== userId && norm(u.email) === norm(next))) throw new ServiceError("Email sudah terdaftar.", "email_taken");
  user.email = next;
}

/** Personal settings per section (invoice, notifications, timezone...). Stored with the credentials, never public. */
export function saveUserPrefs(creds: Credentials, userId: string, section: string, values: Record<string, unknown>) {
  const rec = creds[userId];
  if (!rec) throw new ServiceError("Akun tidak ditemukan.", "no_user");
  rec.prefs = { ...(rec.prefs ?? {}), [section]: values };
}

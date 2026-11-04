import { randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seedAdminDb, type AdminDb } from "@/lib/admin-data";
import { decryptSecret, encryptSecret, getEncKey } from "../crypto-at-rest";
import { applyPersisted, createFileStore, createMemoryStore, getStore, persistAdminState } from "../store";
import * as OTPAuth from "otpauth";
import { checkKeyStability } from "../key-check";
import { matchTotpStep, totpAt, totpStep } from "../totp";
import { beginSetup, checkCode, confirmSetup, disable, fingerprint, PENDING_TTL_MS, userMessage } from "../twofactor";

const key = randomBytes(32);
const ADMIN = "adm_1";
const t0 = new Date("2026-11-04T10:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

let db: AdminDb;
beforeEach(() => {
  db = seedAdminDb();
});

/** Runs a full setup and returns the plain secret and the backup codes. */
function enable(d: AdminDb, now = t0) {
  const begin = beginSetup(d, ADMIN, key, now);
  if (begin.status !== "pending") throw new Error("expected pending");
  const result = confirmSetup(d, ADMIN, totpAt(begin.secret, now.getTime()), key, now);
  if (!result.ok) throw new Error(result.error);
  return { secret: begin.secret, backupCodes: result.backupCodes };
}

describe("setup flow", () => {
  it("reloading setup shows the SAME pending secret until it expires", () => {
    const a = beginSetup(db, ADMIN, key, t0);
    const b = beginSetup(db, ADMIN, key, later(60_000));
    if (a.status !== "pending" || b.status !== "pending") throw new Error("pending expected");
    expect(b.secret).toBe(a.secret);
    expect(b.reused).toBe(true);
    // after 10 minutes the pending secret is gone and a new one is generated
    const c = beginSetup(db, ADMIN, key, later(PENDING_TTL_MS + 1000));
    if (c.status !== "pending") throw new Error("pending expected");
    expect(c.secret).not.toBe(a.secret);
    expect(c.reused).toBe(false);
  });

  it("an expired pending setup cannot be confirmed", () => {
    const a = beginSetup(db, ADMIN, key, t0);
    if (a.status !== "pending") throw new Error("pending expected");
    const r = confirmSetup(db, ADMIN, totpAt(a.secret, later(PENDING_TTL_MS + 1000).getTime()), key, later(PENDING_TTL_MS + 1000));
    expect(r.ok).toBe(false);
  });

  it("a wrong code does not enable 2FA; the right one does, with 10 backup codes and no plain secret stored", () => {
    const a = beginSetup(db, ADMIN, key, t0);
    if (a.status !== "pending") throw new Error("pending expected");
    expect(confirmSetup(db, ADMIN, "000000", key, t0).ok).toBe(false);
    expect(db.adminSecurity[ADMIN]).toBeUndefined();
    const r = confirmSetup(db, ADMIN, totpAt(a.secret, t0.getTime()), key, t0);
    expect(r.ok && r.backupCodes).toHaveLength(10);
    expect(db.adminSecurity[ADMIN].enabled).toBe(true);
    expect(db.pending2fa[ADMIN]).toBeUndefined();
    const stored = JSON.stringify(db.adminSecurity) + JSON.stringify(db.pending2fa);
    expect(stored).not.toContain(a.secret);
    if (r.ok) for (const code of r.backupCodes) expect(stored).not.toContain(code); // only hashes
  });

  it("accepts a code one step either side (clock drift)", () => {
    const a = beginSetup(db, ADMIN, key, t0);
    if (a.status !== "pending") throw new Error("pending expected");
    expect(confirmSetup(db, ADMIN, totpAt(a.secret, t0.getTime() - 30_000), key, t0).ok).toBe(true);
  });

  it("an enabled admin never gets a new setup (the page redirects away)", () => {
    enable(db);
    const again = beginSetup(db, ADMIN, key, later(1000));
    expect(again.status).toBe("already_enabled");
    expect(db.pending2fa[ADMIN]).toBeUndefined();
  });
});

describe("durability", () => {
  it("2FA survives a simulated store reload (memory store)", () => {
    const store = createMemoryStore();
    const { secret } = enable(db);
    persistAdminState(db, store);
    const reloaded = seedAdminDb(); // fresh seed = dev server restart
    expect(reloaded.adminSecurity[ADMIN]).toBeUndefined();
    applyPersisted(reloaded, store);
    expect(reloaded.adminSecurity[ADMIN].enabled).toBe(true);
    // a new code in the next step is accepted with the reloaded state
    expect(checkCode(reloaded, ADMIN, totpAt(secret, later(31_000).getTime()), key, later(31_000)).ok).toBe(true);
  });

  it("2FA survives a restart through the real JSON file store", () => {
    const dir = mkdtempSync(join(tmpdir(), "sg-store-"));
    try {
      const path = join(dir, "nested", "dev-store.json");
      enable(db);
      persistAdminState(db, createFileStore(path));
      const reloaded = seedAdminDb();
      applyPersisted(reloaded, createFileStore(path)); // a brand new store object, like a new process
      expect(reloaded.adminSecurity[ADMIN].enabled).toBe(true);
      expect(reloaded.adminSecurity[ADMIN].backupHashes).toHaveLength(10);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("the pending secret survives a reload too, so the QR stays the same", () => {
    const store = createMemoryStore();
    const a = beginSetup(db, ADMIN, key, t0);
    persistAdminState(db, store);
    const reloaded = seedAdminDb();
    applyPersisted(reloaded, store);
    const b = beginSetup(reloaded, ADMIN, key, later(5000));
    if (a.status !== "pending" || b.status !== "pending") throw new Error("pending expected");
    expect(b.secret).toBe(a.secret);
  });

  it("a reseed without persisted data does not invent 2FA, and persisted data always wins over seed data", () => {
    const store = createMemoryStore();
    expect(applyPersisted(seedAdminDb(), store)).toBe(false);
    enable(db);
    persistAdminState(db, store);
    expect(applyPersisted(seedAdminDb(), store)).toBe(true);
  });

  it("tests use their own isolated store (never the dev file)", () => {
    expect(process.env.VITEST).toBeTruthy();
    const shared = getStore();
    shared.update({ adminPasswords: { x: "y" } });
    expect(createMemoryStore().read().adminPasswords).toBeUndefined();
    shared.clear();
  });
});

describe("login codes", () => {
  it("rejects a replayed code and anything older, accepts the next step", () => {
    const { secret } = enable(db);
    const step1 = later(31_000);
    const code = totpAt(secret, step1.getTime());
    expect(checkCode(db, ADMIN, code, key, step1).ok).toBe(true);
    expect(checkCode(db, ADMIN, code, key, step1)).toMatchObject({ ok: false });
    expect(checkCode(db, ADMIN, totpAt(secret, t0.getTime()), key, step1).ok).toBe(false); // older step
    const next = later(62_000);
    expect(checkCode(db, ADMIN, totpAt(secret, next.getTime()), key, next).ok).toBe(true);
  });

  it("the code used to finish setup still works for the first sign-in (setup is not a login), then only once", () => {
    // Regression: setup used to burn its step, so signing in right after setup with the code still shown on the
    // phone was rejected as a "replay" and reported as a plain wrong code.
    const { secret } = enable(db);
    const code = totpAt(secret, t0.getTime());
    expect(db.adminSecurity[ADMIN].lastUsedStep).toBe(0);
    expect(checkCode(db, ADMIN, code, key, t0).ok).toBe(true);
    expect(checkCode(db, ADMIN, code, key, t0)).toMatchObject({ ok: false, reason: "replay" });
  });

  it("a backup code works exactly once", () => {
    const { backupCodes } = enable(db);
    expect(checkCode(db, ADMIN, backupCodes[0], key, later(1000))).toMatchObject({ ok: true, via: "backup" });
    expect(checkCode(db, ADMIN, backupCodes[0], key, later(2000)).ok).toBe(false);
    expect(checkCode(db, ADMIN, backupCodes[1], key, later(3000)).ok).toBe(true);
    expect(db.adminSecurity[ADMIN].backupHashes).toHaveLength(8);
  });

  it("an account without 2FA cannot pass a code check", () => {
    expect(checkCode(db, ADMIN, "123456", key, t0).ok).toBe(false);
  });
});

describe("disable / re-setup needs re-authentication", () => {
  it("needs the password AND a current code", () => {
    const { secret } = enable(db);
    const now = later(31_000);
    const code = totpAt(secret, now.getTime());
    expect(disable(db, ADMIN, { passwordOk: false, code }, key, now)).toMatchObject({ ok: false, error: "Password salah." });
    expect(db.adminSecurity[ADMIN].enabled).toBe(true);
    expect(disable(db, ADMIN, { passwordOk: true, code: "000000" }, key, now).ok).toBe(false);
    expect(db.adminSecurity[ADMIN].enabled).toBe(true);
    expect(disable(db, ADMIN, { passwordOk: true, code }, key, now).ok).toBe(true);
    expect(db.adminSecurity[ADMIN]).toBeUndefined();
  });

  it("only after disabling can a new setup start, with a new secret", () => {
    const first = enable(db);
    const now = later(31_000);
    disable(db, ADMIN, { passwordOk: true, code: totpAt(first.secret, now.getTime()) }, key, now);
    const b = beginSetup(db, ADMIN, key, later(40_000));
    expect(b.status === "pending" && b.secret).not.toBe(first.secret);
  });
});

describe("encryption at rest", () => {
  it("round-trips and fails with a wrong key or tampering", () => {
    const enc = encryptSecret("JBSWY3DPEHPK3PXP", key);
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc, key)).toBe("JBSWY3DPEHPK3PXP");
    expect(() => decryptSecret(enc, randomBytes(32))).toThrow();
    const [iv, tag, data] = enc.split(".");
    expect(() => decryptSecret([iv, tag, Buffer.from("x").toString("base64") + data].join("."), key)).toThrow();
  });

  describe("key from the environment", () => {
    const saved = process.env.ADMIN_2FA_ENC_KEY;
    afterEach(() => {
      if (saved === undefined) delete process.env.ADMIN_2FA_ENC_KEY;
      else process.env.ADMIN_2FA_ENC_KEY = saved;
    });
    it("fails loudly when ADMIN_2FA_ENC_KEY is missing", () => {
      delete process.env.ADMIN_2FA_ENC_KEY;
      expect(() => getEncKey()).toThrow(/ADMIN_2FA_ENC_KEY/);
    });
    it("accepts a 32-byte base64 key", () => {
      process.env.ADMIN_2FA_ENC_KEY = randomBytes(32).toString("base64");
      expect(getEncKey()).toHaveLength(32);
    });
  });
});

/** An authenticator-compatible implementation that is NOT ours (the `otpauth` package: what the phone app does). */
const authenticator = (secret: string) => new OTPAuth.TOTP({ algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });

describe("compatibility with real authenticator apps", () => {
  it("our codes equal the reference library for the RFC 6238 vectors", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"; // base32 of "12345678901234567890"
    expect(totpAt(secret, 59_000)).toBe("287082");
    expect(totpAt(secret, 1_111_111_109_000)).toBe("081804");
    expect(authenticator(secret).generate({ timestamp: 59_000 })).toBe("287082");
  });

  it("a code from the reference library verifies for the STORED (encrypted) secret", () => {
    const { secret } = enable(db);
    // read the secret back the way login does: from the stored, encrypted value
    const stored = decryptSecret(db.adminSecurity[ADMIN].secretEnc!, key);
    expect(stored).toBe(secret);
    const now = later(45_000);
    const code = authenticator(stored).generate({ timestamp: now.getTime() });
    expect(checkCode(db, ADMIN, code, key, now).ok).toBe(true);
  });

  it("agrees with the reference library on random secrets and times", () => {
    for (let i = 0; i < 25; i++) {
      const secret = beginSetup(seedAdminDb(), ADMIN, key, new Date(1_700_000_000_000 + i * 7_919_000));
      if (secret.status !== "pending") throw new Error("pending expected");
      const ts = 1_700_000_000_000 + i * 123_457_000;
      expect(totpAt(secret.secret, ts)).toBe(authenticator(secret.secret).generate({ timestamp: ts }));
    }
  });

  it("the otpauth URL uses SHA1, 6 digits and a 30 second period", async () => {
    const { otpauthUrl } = await import("../totp");
    const url = otpauthUrl("JBSWY3DPEHPK3PXP", "admin@jagoansosmed.com");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
    expect(url).not.toContain("algorithm=SHA256");
  });

  it("the secret verified at login is the one confirmed at setup (same fingerprint, no re-generation)", () => {
    const begin = beginSetup(db, ADMIN, key, t0);
    if (begin.status !== "pending") throw new Error("pending expected");
    const confirm = confirmSetup(db, ADMIN, totpAt(begin.secret, t0.getTime()), key, t0);
    if (!confirm.ok) throw new Error(confirm.error);
    const login = checkCode(db, ADMIN, totpAt(begin.secret, later(31_000).getTime()), key, later(31_000));
    expect(login.ok).toBe(true);
    expect(login.diag.fingerprint).toBe(confirm.fingerprint);
    expect(confirm.fingerprint).toBe(fingerprint(begin.secret));
  });
});

describe("time window", () => {
  it("accepts the previous, current and next step, and nothing further away", () => {
    const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
    const now = t0.getTime();
    for (const offset of [-1, 0, 1]) {
      expect(matchTotpStep(secret, totpAt(secret, now + offset * 30_000), now)).toBe(totpStep(now + offset * 30_000));
    }
    expect(matchTotpStep(secret, totpAt(secret, now - 60_000), now)).toBeNull();
    expect(matchTotpStep(secret, totpAt(secret, now + 60_000), now)).toBeNull();
  });

  it("a stale step (older than the last used one) is rejected as a replay, not as a wrong code", () => {
    const { secret } = enable(db);
    const now = later(5 * 60_000);
    expect(checkCode(db, ADMIN, totpAt(secret, now.getTime()), key, now).ok).toBe(true);
    const stale = checkCode(db, ADMIN, totpAt(secret, now.getTime() - 30_000), key, now);
    expect(stale).toMatchObject({ ok: false, reason: "replay" });
    expect(stale.diag.matchedStep).toBeLessThan(stale.diag.lastUsedStep ?? 0);
  });

  it("a code from a different secret is a wrong code, reported with the window", () => {
    enable(db);
    const r = checkCode(db, ADMIN, "000000", key, later(5 * 60_000));
    expect(r).toMatchObject({ ok: false, reason: "wrong_code" });
    expect(r.diag.window[1] - r.diag.window[0]).toBe(2);
  });
});

describe("decrypt failures and messages", () => {
  it("a changed key is reported as decrypt_error, distinct from a wrong code", () => {
    const { secret } = enable(db);
    const otherKey = randomBytes(32);
    const r = checkCode(db, ADMIN, totpAt(secret, later(31_000).getTime()), otherKey, later(31_000));
    expect(r).toMatchObject({ ok: false, reason: "decrypt_error" });
    expect(r.diag.decrypt).toBe("failed");
    expect(r.diag.fingerprint).toBeNull();
  });

  it("development shows the reason; production always shows the same generic text", () => {
    const { secret } = enable(db);
    const reasons = [
      checkCode(db, ADMIN, "000000", key, later(5 * 60_000)), // wrong_code
      checkCode(db, ADMIN, totpAt(secret, later(31_000).getTime()), randomBytes(32), later(31_000)), // decrypt_error
    ];
    const dev = reasons.map((r) => (r.ok ? "" : userMessage(r.reason, r.diag, true)));
    const prod = reasons.map((r) => (r.ok ? "" : userMessage(r.reason, r.diag, false)));
    expect(dev[0]).toContain("[dev]");
    expect(dev[1]).toContain("ADMIN_2FA_ENC_KEY");
    expect(new Set(dev).size).toBe(2);
    expect(prod).toEqual(["Kode salah atau kedaluwarsa.", "Kode salah atau kedaluwarsa."]);
  });

  it("never puts the secret or the code in the diagnostics", () => {
    const { secret } = enable(db);
    const now = later(31_000);
    const code = totpAt(secret, now.getTime());
    const r = checkCode(db, ADMIN, code, key, now);
    const dump = JSON.stringify(r.diag);
    expect(dump).not.toContain(secret);
    expect(dump).not.toContain(code);
  });

  it("an unreadable pending secret is replaced instead of blocking setup", () => {
    beginSetup(db, ADMIN, key, t0);
    const b = beginSetup(db, ADMIN, randomBytes(32), later(1000));
    expect(b.status).toBe("pending");
  });
});

describe("encryption key stability", () => {
  it("initialises once, then notices when the key changed", () => {
    const store = createMemoryStore();
    expect(checkKeyStability(store, key)).toBe("initialised");
    expect(checkKeyStability(store, key)).toBe("ok");
    expect(checkKeyStability(store, randomBytes(32))).toBe("changed");
  });

  it("a store that was changed from outside is detected (e.g. the reset CLI)", () => {
    const store = createMemoryStore();
    const v = store.version();
    store.update({ adminSecurity: {} });
    expect(store.version()).not.toBe(v);
  });
});

/**
 * ADMIN_2FA_ENC_KEY must not change once 2FA secrets exist. A known string is stored encrypted next to the data;
 * if it no longer decrypts, the key changed and every stored 2FA secret is unreadable. Say so loudly, once.
 */
import { decryptSecret, encryptSecret, getEncKey } from "./crypto-at-rest";
import type { Store } from "./store";

const PROBE = "sosmedgo-2fa-key-check";

export type KeyStatus = "ok" | "initialised" | "changed";

export function checkKeyStability(store: Store, key: Buffer = getEncKey()): KeyStatus {
  const saved = store.read().keyCheck;
  if (!saved) {
    store.update({ keyCheck: encryptSecret(PROBE, key) });
    return "initialised";
  }
  try {
    return decryptSecret(saved, key) === PROBE ? "ok" : "changed";
  } catch {
    return "changed";
  }
}

export const KEY_CHANGED_MESSAGE =
  "ADMIN_2FA_ENC_KEY BERUBAH sejak 2FA diaktifkan: rahasia 2FA yang tersimpan tidak bisa didekripsi. " +
  "Kembalikan key lama di .env.local, atau jalankan: npm run admin:reset-2fa -- <username>";

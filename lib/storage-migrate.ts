import { brand } from "@/lib/brand";

/**
 * One-time migration of browser storage written under the previous product name: copies the value to the new key
 * (only when the new key is still empty) and removes the old one, so existing settings are kept.
 * Safe to call often: it does nothing after the first run.
 */
const LEGACY: { oldKey: string; newKey: string; prefix?: boolean }[] = [
  { oldKey: "sosmedgo:favorite-services", newKey: `${brand.storagePrefix}:favorite-services` },
  { oldKey: "sg:ann-dismissed:", newKey: `${brand.storagePrefix}:ann-dismissed:`, prefix: true },
];

let done = false;

export function migrateLegacyStorage(): void {
  if (done || typeof window === "undefined") return;
  done = true;
  try {
    const store = window.localStorage;
    const keys = Array.from({ length: store.length }, (_, i) => store.key(i)).filter((k): k is string => k !== null);
    for (const rule of LEGACY) {
      for (const key of keys) {
        const match = rule.prefix ? key.startsWith(rule.oldKey) : key === rule.oldKey;
        if (!match) continue;
        const target = rule.prefix ? rule.newKey + key.slice(rule.oldKey.length) : rule.newKey;
        const value = store.getItem(key);
        if (value !== null && store.getItem(target) === null) store.setItem(target, value);
        store.removeItem(key);
      }
    }
  } catch {
    /* storage blocked: nothing to migrate */
  }
}

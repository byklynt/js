import { brand } from "@/lib/brand";
import { migrateLegacyStorage } from "@/lib/storage-migrate";

const FAVORITES_KEY = `${brand.storagePrefix}:favorite-services`;

/** Legacy: favorites used to be stored in localStorage. Read only to import them into the database once. */
export function readFavorites(): string[] {
  try {
    migrateLegacyStorage();
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

/** Removes the old browser-side copy once it has been imported into the database. */
export function clearLocalFavorites(): void {
  try {
    window.localStorage.removeItem(FAVORITES_KEY);
  } catch {
    // Ignore (private browsing, storage disabled, etc.)
  }
}

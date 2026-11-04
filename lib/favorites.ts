import { brand } from "@/lib/brand";
import { migrateLegacyStorage } from "@/lib/storage-migrate";

const FAVORITES_KEY = `${brand.storagePrefix}:favorite-services`;

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

export function writeFavorites(ids: string[]): void {
  try {
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
  } catch {
    // Ignore write failures (private browsing, storage disabled, etc.)
  }
}

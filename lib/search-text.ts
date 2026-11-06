/**
 * Service search text: trimmed, one leading "#" (or several) ignored ("#26826" finds provider service 26826), inner whitespace collapsed.
 * Shared by the admin and user searches, client and server. The database matches it as a plain, case-insensitive substring.
 */
export function normalizeServiceSearch(raw: string | null | undefined): string {
  return String(raw ?? "").trim().replace(/^#+\s*/, "").replace(/\s+/g, " ").trim();
}

/** Searches shorter than this are ignored (the list stays as filtered). */
export const MIN_SERVICE_SEARCH = 2;

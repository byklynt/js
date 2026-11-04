/** Accepts http(s) URLs or an @username handle. */
export function isValidLink(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^@[\w.]{2,}$/.test(trimmed)) return true;
  try {
    const url = new URL(trimmed);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

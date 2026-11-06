/**
 * "Custom Comments" input: one comment per line. Pure functions shared by the order form and the server actions; the database
 * (public.parse_comment_lines / place_order) applies the same rules and is the one that counts.
 * Comments are plain text: they are never rendered as HTML anywhere (React escapes them) and never put into notifications or tickets.
 */

/** Per comment, and in total (characters). Mirrors place_order. */
export const MAX_COMMENT_LENGTH = 300;
export const MAX_COMMENTS_TOTAL_CHARS = 50_000;

// control characters (tab becomes a space first) and invisible / direction-override characters
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f]/g;
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** Splits on any newline style, strips control characters, trims each line and drops the empty ones. */
export function parseCommentLines(text: string): string[] {
  return String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\t/g, " ").replace(CONTROL, "").replace(INVISIBLE, "").trim())
    .filter((l) => l !== "");
}

export type CommentsAnalysis = {
  lines: string[];
  /** = the order quantity */
  count: number;
  /** Lines longer than MAX_COMMENT_LENGTH (1-based position in the cleaned list). */
  tooLong: number[];
  totalChars: number;
  tooBig: boolean;
  /** Number of lines that repeat an earlier line (case-insensitive). A warning only: Likeo's rule is unverified. */
  duplicates: number;
};

export function analyzeComments(text: string): CommentsAnalysis {
  const lines = parseCommentLines(text);
  const seen = new Set<string>();
  let duplicates = 0;
  const tooLong: number[] = [];
  lines.forEach((l, i) => {
    if ([...l].length > MAX_COMMENT_LENGTH) tooLong.push(i + 1);
    const k = l.toLowerCase();
    if (seen.has(k)) duplicates++;
    else seen.add(k);
  });
  const totalChars = lines.join("\n").length;
  return { lines, count: lines.length, tooLong, totalChars, tooBig: totalChars > MAX_COMMENTS_TOTAL_CHARS, duplicates };
}

const nf = (n: number) => n.toLocaleString("id-ID");

/** The first thing that blocks the order, in Indonesian, or null. min / max are the service limits for the number of comments. */
export function commentsError(a: CommentsAnalysis, min: number, max: number): string | null {
  if (a.count === 0) return "Isi minimal satu komentar (satu komentar per baris).";
  if (a.tooLong.length) return `Komentar baris ${a.tooLong.slice(0, 3).join(", ")}${a.tooLong.length > 3 ? " dan lainnya" : ""} lebih dari ${MAX_COMMENT_LENGTH} karakter.`;
  if (a.tooBig) return `Total komentar maksimal ${nf(MAX_COMMENTS_TOTAL_CHARS)} karakter (sekarang ${nf(a.totalChars)}).`;
  if (a.count < min) return `Kurang ${nf(min - a.count)} komentar: minimal ${nf(min)} komentar.`;
  if (a.count > max) return `Kelebihan ${nf(a.count - max)} komentar: maksimal ${nf(max)} komentar.`;
  return null;
}

/** Price in whole Rupiah, the same rounding as place_order: ceil(price per 1000 x count / 1000). */
export const commentsPrice = (pricePer1000: number, count: number) => Math.ceil((pricePer1000 * count) / 1000);

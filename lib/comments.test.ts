import { describe, expect, it } from "vitest";
import { analyzeComments, commentsError, commentsPrice, MAX_COMMENT_LENGTH, MAX_COMMENTS_TOTAL_CHARS, parseCommentLines } from "./comments";
import { serviceKind } from "./service-kind";

describe("parseCommentLines", () => {
  it("trims, drops empty lines and handles every newline style", () => {
    expect(parseCommentLines("  a  \r\n\r\n b\rc\n\n  \n")).toEqual(["a", "b", "c"]);
    expect(parseCommentLines("")).toEqual([]);
    expect(parseCommentLines("\n\n   \n")).toEqual([]);
  });
  it("strips control and invisible characters, tabs become spaces", () => {
    expect(parseCommentLines("he\u0000llo\u0007\nwo\u200brld\u202e\nA\tB")).toEqual(["hello", "world", "A B"]);
  });
  it("keeps HTML as plain text (it is escaped when shown, never interpreted)", () => {
    expect(parseCommentLines("<script>alert(1)</script>\n<b>x</b>")).toEqual(["<script>alert(1)</script>", "<b>x</b>"]);
  });
});

describe("analyzeComments / commentsError", () => {
  it("counts the non-empty lines", () => {
    expect(analyzeComments("one\n\ntwo\nthree\n").count).toBe(3);
  });
  it("warns about duplicates (case-insensitive) without blocking", () => {
    const a = analyzeComments("Keren\nkeren\nMantap");
    expect(a.duplicates).toBe(1);
    expect(commentsError(a, 1, 10)).toBeNull();
  });
  it("limits per comment and in total", () => {
    const long = "x".repeat(MAX_COMMENT_LENGTH + 1);
    expect(analyzeComments(`ok\n${long}`).tooLong).toEqual([2]);
    expect(commentsError(analyzeComments(`ok\n${long}`), 1, 10)).toMatch(/baris 2/);
    expect(analyzeComments("x".repeat(MAX_COMMENT_LENGTH)).tooLong).toEqual([]);
    const many = Array.from({ length: Math.ceil(MAX_COMMENTS_TOTAL_CHARS / 100) + 2 }, () => "y".repeat(100)).join("\n");
    expect(analyzeComments(many).tooBig).toBe(true);
    expect(commentsError(analyzeComments(many), 1, 100_000)).toMatch(/Total komentar maksimal/);
  });
  it("min / max with clear Indonesian messages", () => {
    expect(commentsError(analyzeComments(""), 10, 100)).toMatch(/minimal satu komentar/);
    expect(commentsError(analyzeComments("a\nb\nc"), 10, 100)).toBe("Kurang 7 komentar: minimal 10 komentar.");
    expect(commentsError(analyzeComments("a\nb\nc\nd"), 1, 3)).toBe("Kelebihan 1 komentar: maksimal 3 komentar.");
    expect(commentsError(analyzeComments("a\nb\nc"), 3, 3)).toBeNull();
  });
});

describe("price", () => {
  it("is ceil(price per 1000 x comments / 1000), like place_order", () => {
    expect(commentsPrice(2500, 3)).toBe(8); // 7.5 -> 8
    expect(commentsPrice(1000, 10)).toBe(10);
    expect(commentsPrice(3333, 1)).toBe(4);
    expect(commentsPrice(2000, 0)).toBe(0);
  });
});

describe("serviceKind (mirrors public.service_kind)", () => {
  it("maps the provider types", () => {
    expect(serviceKind(null)).toBe("default");
    expect(serviceKind("")).toBe("default");
    expect(serviceKind("Default")).toBe("default");
    expect(serviceKind(" custom comments ")).toBe("comments");
    for (const t of ["Custom Comments Package", "Package", "Poll", "Mentions Custom List", "Subscription", "Comment Likes"]) expect(serviceKind(t), t).toBe("unsupported");
  });
});

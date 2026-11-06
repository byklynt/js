import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Markdown, safeHref, safeImage } from "../components/landing/markdown";

vi.mock("next/link", () => ({ default: (p: { href: string; children: unknown; className?: string }) => createElement("a", { href: p.href, className: p.className }, p.children as never) }));

const html = (md: string) => renderToStaticMarkup(createElement(Markdown, { source: md }));

describe("Markdown never emits raw HTML (XSS payloads are shown as text or dropped)", () => {
  const payloads = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "<iframe src=\"https://evil.example\"></iframe>",
    "<a href=\"javascript:alert(1)\" onclick=\"alert(1)\">klik</a>",
    "<svg onload=alert(1)>",
    "<style>body{display:none}</style>",
    "<details open ontoggle=alert(1)>",
  ];
  it.each(payloads)("%s", (p) => {
    const out = html(`Awal\n\n${p}\n\nAkhir`);
    expect(out).not.toMatch(/<script|<iframe|<svg|<style|<details|<img[^>]*onerror|<a [^>]*onclick/i);
    expect(out).toContain("&lt;"); // escaped text
  });
  it("drops javascript: and data: links and images", () => {
    const out = html("[klik](javascript:alert(1)) [lagi](JaVaScRiPt:alert(1)) [data](data:text/html;base64,PHNjcmlwdD4=) ![x](javascript:alert(1)) ![y](data:image/svg+xml;base64,AAA)");
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/data:/i);
    expect(out).not.toContain("<a ");
    expect(out).not.toContain("<img");
    expect(out).toContain("klik");
  });
  it("tabs, newlines and control characters inside a URL do not smuggle a scheme", () => {
    expect(safeHref("java\tscript:alert(1)")).toBeNull();
    expect(safeHref("java\nscript:alert(1)")).toBeNull();
    expect(safeHref(" javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example/x")).toBeNull(); // protocol-relative
    expect(safeHref("vbscript:x")).toBeNull();
  });
  it("keeps safe links: external ones get nofollow noopener, site paths stay internal", () => {
    const out = html("[luar](https://example.com/a?b=1) [dalam](/services)");
    expect(out).toContain('href="https://example.com/a?b=1"');
    expect(out).toContain('rel="nofollow noopener noreferrer"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain('href="/services"');
    expect(out.match(/rel="nofollow/g)?.length).toBe(1); // only the external one
  });
  it("images are lazy with width and height (from #WxH, else a 16:9 default) and keep alt text escaped", () => {
    const out = html('![Foto "bagus" <b>](https://cdn.example/a.webp#800x450) ![b](https://cdn.example/b.png)');
    expect(out).toContain('loading="lazy"');
    expect(out).toContain('width="800" height="450"');
    expect(out).toContain('src="https://cdn.example/a.webp"');
    expect(out).toContain('width="1200" height="675"');
    expect(out).not.toContain("<b>");
    expect(safeImage("/img/a.png#640x480")).toEqual({ src: "/img/a.png", width: 640, height: 480 });
  });
  it("renders headings (a single # becomes h2), lists, quotes and code blocks as elements", () => {
    const out = html("# Judul\n\n### Sub\n\n- satu\n- dua\n\n1. a\n2. b\n\n> kutipan\n\n```\n<script>x</script>\n```\n\n**tebal** *miring* `kode`");
    expect(out).toContain("<h2");
    expect(out).not.toContain("<h1");
    expect(out).toContain("<h3");
    expect(out).toContain("<ul");
    expect(out).toContain("<ol");
    expect(out).toContain("<blockquote");
    expect(out).toContain("<pre");
    expect(out).not.toMatch(/<script/);
    expect(out).toContain("<strong>tebal</strong>");
  });
});

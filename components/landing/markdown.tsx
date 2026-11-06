import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Safe Markdown renderer for blog posts. It never injects HTML: everything is built as React elements and text, so a script tag, an iframe or an
 * inline event handler typed in the article is shown as plain text, never executed. Links and image sources are checked (http(s) or a site path only:
 * javascript:, data: and friends are dropped). External links get rel="nofollow noopener noreferrer"; images are lazy and carry width / height.
 *
 * Supports: # ## ### #### headings (a "#" is shown as h2: the page title is the h1), paragraphs, - and 1. lists, > quotes, ``` code blocks, ---,
 * **bold**, *italic*, \`code\`, [text](url) and ![alt](url) (an image URL may end with #WIDTHxHEIGHT, which the editor adds on upload).
 */

const FALLBACK_W = 1200;
const FALLBACK_H = 675;

/** A link target that is safe to render, or null. Site paths ("/x") and http(s) URLs only. */
export function safeHref(raw: string): string | null {
  const url = raw.replace(/[\u0000-\u001f\u007f\s]+/g, "");
  if (/^\/(?!\/)/.test(url)) return url;
  if (/^https?:\/\/[^/]+/i.test(url)) return url;
  return null;
}

/** An image source plus the width / height from a trailing #WxH, or null when the source is not safe. */
export function safeImage(raw: string): { src: string; width: number; height: number } | null {
  const href = safeHref(raw);
  if (!href) return null;
  const m = /#(\d{2,5})x(\d{2,5})$/.exec(href);
  const src = m ? href.slice(0, m.index) : href;
  return { src, width: m ? Number(m[1]) : FALLBACK_W, height: m ? Number(m[2]) : FALLBACK_H };
}

const isExternal = (href: string) => /^https?:\/\//i.test(href);

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(!\[[^\]]*\]\([^)\s]+\)|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const t = m[0];
    const key = `${keyBase}-${i++}`;
    if (t.startsWith("![")) {
      const im = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t)!;
      const img = safeImage(im[2]);
      if (img) {
        // eslint-disable-next-line @next/next/no-img-element
        out.push(<img key={key} src={img.src} alt={im[1]} width={img.width} height={img.height} loading="lazy" decoding="async" className="my-2 h-auto w-full rounded-2xl" />);
      } else out.push(im[1]);
    } else if (t.startsWith("**")) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] dark:bg-slate-800">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!;
      const href = safeHref(lm[2]);
      if (!href) out.push(lm[1]);
      else if (isExternal(href)) out.push(<a key={key} href={href} rel="nofollow noopener noreferrer" target="_blank" className="text-primary-600 underline [overflow-wrap:anywhere] dark:text-primary-300">{lm[1]}</a>);
      else out.push(<Link key={key} href={href} className="text-primary-600 underline [overflow-wrap:anywhere] dark:text-primary-300">{lm[1]}</Link>);
    } else out.push(<em key={key}>{t.slice(1, -1)}</em>);
    last = idx + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const headingClass = ["", "", "pt-2 text-xl font-bold text-slate-900 dark:text-white", "text-lg font-bold text-slate-900 dark:text-white", "text-base font-bold text-slate-900 dark:text-white"];

export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let bi = 0;
  const key = () => `b${bi++}`;
  const flush = () => {
    if (!para.length) return;
    const k = key();
    blocks.push(<p key={k}>{inline(para.join(" "), k)}</p>);
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    // fenced code block
    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) code.push(lines[i]);
      const k = key();
      blocks.push(<pre key={k} className="thin-scroll overflow-x-auto rounded-2xl bg-slate-100 p-4 text-[13px] leading-relaxed dark:bg-slate-800"><code>{code.join("\n")}</code></pre>);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (h) {
      flush();
      const level = Math.max(2, h[1].length);
      const k = key();
      const cls = headingClass[level];
      blocks.push(level === 2 ? <h2 key={k} className={cls}>{inline(h[2], k)}</h2> : level === 3 ? <h3 key={k} className={cls}>{inline(h[2], k)}</h3> : <h4 key={k} className={cls}>{inline(h[2], k)}</h4>);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flush();
      blocks.push(<hr key={key()} className="border-slate-200 dark:border-slate-800" />);
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const quote: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i++) quote.push(lines[i].trim().replace(/^>\s?/, ""));
      i--;
      const k = key();
      blocks.push(<blockquote key={k} className="border-l-4 border-primary-200 pl-4 italic text-slate-500 dark:border-slate-700 dark:text-slate-400">{inline(quote.join(" "), k)}</blockquote>);
      continue;
    }
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      flush();
      const ordered = /^\d+\.\s+/.test(trimmed);
      const re = ordered ? /^\d+\.\s+/ : /^[-*]\s+/;
      const items: string[] = [];
      for (; i < lines.length && re.test(lines[i].trim()); i++) items.push(lines[i].trim().replace(re, ""));
      i--;
      const k = key();
      const lis = items.map((it, n) => <li key={n}>{inline(it, `${k}-${n}`)}</li>);
      blocks.push(ordered ? <ol key={k} className="list-decimal space-y-1 pl-5">{lis}</ol> : <ul key={k} className="list-disc space-y-1 pl-5">{lis}</ul>);
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return <div className="space-y-4 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">{blocks}</div>;
}

import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Minimal, safe Markdown renderer for blog posts (no raw HTML is ever injected).
 * Supports: ## / ### headings, paragraphs, - lists, 1. lists, **bold**, *italic*, `code`, [text](https://...|/path).
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const t = m[0];
    const key = `${keyBase}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={key}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-[0.9em] dark:bg-slate-800">{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(t)!;
      const href = lm[2];
      if (href.startsWith("/")) out.push(<Link key={key} href={href} className="text-primary-600 underline dark:text-primary-300">{lm[1]}</Link>);
      else if (/^https?:\/\//i.test(href)) out.push(<a key={key} href={href} rel="noopener noreferrer" target="_blank" className="text-primary-600 underline dark:text-primary-300">{lm[1]}</a>);
      else out.push(lm[1]);
    } else out.push(<em key={key}>{t.slice(1, -1)}</em>);
    last = idx + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
      {blocks.map((raw, bi) => {
        const block = raw.trim();
        if (!block) return null;
        const key = `b${bi}`;
        const h = /^(#{2,3})\s+(.*)$/.exec(block);
        if (h) {
          const cls = h[1].length === 2 ? "pt-2 text-xl font-bold text-slate-900 dark:text-white" : "text-lg font-bold text-slate-900 dark:text-white";
          return h[1].length === 2 ? <h2 key={key} className={cls}>{inline(h[2], key)}</h2> : <h3 key={key} className={cls}>{inline(h[2], key)}</h3>;
        }
        const lines = block.split("\n");
        if (lines.every((l) => /^[-*]\s+/.test(l))) {
          return <ul key={key} className="list-disc space-y-1 pl-5">{lines.map((l, i) => <li key={i}>{inline(l.replace(/^[-*]\s+/, ""), `${key}-${i}`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\d+\.\s+/.test(l))) {
          return <ol key={key} className="list-decimal space-y-1 pl-5">{lines.map((l, i) => <li key={i}>{inline(l.replace(/^\d+\.\s+/, ""), `${key}-${i}`)}</li>)}</ol>;
        }
        return <p key={key}>{inline(lines.join(" "), key)}</p>;
      })}
    </div>
  );
}

import Link from "next/link";
import { Logo } from "@/components/shared/logo";
import { LegalFooter } from "@/components/legal/legal-page";
import { formatLegalDate, LEGAL_VERSION, type LegalBlock, type LegalDoc } from "@/lib/legal-content";
import { siteConfig } from "@/lib/site-config";

/** [label](/path) -> link, **text** -> bold. Everything else is plain text (React escapes it). */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, i) => {
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          return (
            <Link key={i} href={link[2]} className="font-medium text-primary-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              {link[1]}
            </Link>
          );
        }
        const bold = /^\*\*([^*]+)\*\*$/.exec(part);
        return bold ? <strong key={i} className="font-semibold text-slate-900 dark:text-white">{bold[1]}</strong> : <span key={i}>{part}</span>;
      })}
    </>
  );
}

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return <p><Inline text={block.text} /></p>;
    case "ul":
      return (
        <ul className="list-disc space-y-1.5 pl-5">
          {block.items.map((item) => (
            <li key={item}><Inline text={item} /></li>
          ))}
        </ul>
      );
    case "example":
      return (
        <div className="rounded-xl border border-primary-100 bg-primary-soft/40 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{block.title}</p>
          {block.lines.map((line) => (
            <p key={line} className="mt-1">{line}</p>
          ))}
        </div>
      );
    case "placeholder":
      return (
        <p className="rounded-xl border border-dashed border-amber-400 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-500/60 dark:bg-amber-500/10 dark:text-amber-200" data-testid="legal-placeholder">
          <strong className="font-semibold">Belum final: </strong>
          {block.text}
        </p>
      );
  }
}

/** Contact rows: only fields that are set. The ticket row always exists (it is a real feature). */
export function contactRows() {
  const rows: { label: string; value: string; href: string }[] = [];
  if (siteConfig.supportEmail) rows.push({ label: "Email", value: siteConfig.supportEmail, href: `mailto:${siteConfig.supportEmail}` });
  if (siteConfig.whatsapp) rows.push({ label: "WhatsApp", value: `+${siteConfig.whatsapp}`, href: `https://wa.me/${siteConfig.whatsapp}` });
  if (siteConfig.telegram) rows.push({ label: "Telegram", value: `@${siteConfig.telegram}`, href: `https://t.me/${siteConfig.telegram}` });
  rows.push({ label: "Tiket bantuan", value: "Buka tiket di dasbor", href: "/dashboard/tickets" });
  return rows;
}

/**
 * Shared shell of the legal pages: title, "Terakhir diperbarui", a table of contents built from the section headings
 * (sticky on desktop, collapsed list on mobile), prose width, anchor links on every h2 and a contact block.
 * Server component: the pages render statically.
 */
export function LegalLayout({ doc }: { doc: LegalDoc }) {
  const toc = [...doc.sections.map((s, i) => ({ id: s.id, label: `${i + 1}. ${s.heading}` })), { id: "hubungi-kami", label: "Hubungi kami" }];
  return (
    <div className="min-h-screen bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      <header className="border-b border-primary-100 px-4 py-4 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Logo />
          <Link href="/" className="text-sm font-medium text-primary-accent hover:underline">
            Beranda
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-10 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-12">
        <aside className="mb-8 lg:mb-0">
          <nav aria-label="Daftar isi" className="lg:sticky lg:top-8">
            <details className="rounded-xl border border-slate-200 px-4 py-3 lg:hidden dark:border-slate-800" data-testid="toc-mobile">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900 dark:text-white">Daftar isi</summary>
              <ol className="mt-3 space-y-2 text-sm">
                {toc.map((t) => (
                  <li key={t.id}><a href={`#${t.id}`} className="text-slate-600 hover:text-primary-accent dark:text-slate-300">{t.label}</a></li>
                ))}
              </ol>
            </details>
            <div className="hidden lg:block" data-testid="toc-desktop">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Daftar isi</p>
              <ol className="mt-3 space-y-2 border-l border-slate-200 pl-4 text-sm dark:border-slate-800">
                {toc.map((t) => (
                  <li key={t.id}><a href={`#${t.id}`} className="text-slate-600 hover:text-primary-accent dark:text-slate-300">{t.label}</a></li>
                ))}
              </ol>
            </div>
          </nav>
        </aside>
        <main className="min-w-0 max-w-[72ch]">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{doc.title}</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400" data-testid="legal-updated">
            Terakhir diperbarui: <time dateTime={LEGAL_VERSION}>{formatLegalDate()}</time> (versi {LEGAL_VERSION})
          </p>
          {doc.intro ? <p className="mt-6 text-sm leading-relaxed">{doc.intro}</p> : null}
          <div className="mt-8 space-y-10 text-sm leading-relaxed">
            {doc.sections.map((s, i) => (
              <section key={s.id} aria-labelledby={s.id} className="space-y-3">
                <h2 id={s.id} className="group scroll-mt-8 text-lg font-bold text-slate-900 dark:text-white">
                  {i + 1}. {s.heading}
                  <a href={`#${s.id}`} aria-label={`Tautan ke bagian ${s.heading}`} className="ml-2 text-primary-accent opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100">
                    #
                  </a>
                </h2>
                {s.blocks.map((b, j) => (
                  <Block key={j} block={b} />
                ))}
              </section>
            ))}
          </div>
          <section aria-labelledby="hubungi-kami" className="mt-12 rounded-2xl border border-primary-100 px-5 py-5 dark:border-slate-800" data-testid="legal-contact">
            <h2 id="hubungi-kami" className="text-base font-bold text-slate-900 dark:text-white">Ada pertanyaan? Hubungi kami</h2>
            <dl className="mt-3 space-y-1.5 text-sm">
              {contactRows().map((r) => (
                <div key={r.label} className="flex gap-3">
                  <dt className="w-28 shrink-0 text-slate-500 dark:text-slate-400">{r.label}</dt>
                  <dd><Link href={r.href} className="font-medium text-primary-accent underline underline-offset-2">{r.value}</Link></dd>
                </div>
              ))}
            </dl>
          </section>
        </main>
      </div>
      <LegalFooter />
    </div>
  );
}

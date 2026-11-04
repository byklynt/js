import Link from "next/link";
import { closingCta, footerLinks, siteConfig } from "@/lib/landing-data";
import { Logo } from "@/components/shared/logo";
import { Reveal } from "./reveal";

export function ClosingFooter() {
  return (
    <>
      <section className="px-4 pb-10">
        <Reveal className="mx-auto max-w-5xl">
          <div className="relative overflow-hidden rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50 via-white to-primary-50 p-8 text-center dark:border-slate-800 dark:from-primary-950/40 dark:via-slate-950 dark:to-slate-950 sm:p-14">
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-200/50 blur-3xl dark:bg-primary-800/30"
            />
            <h2 className="relative mx-auto max-w-xl text-balance text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              {closingCta.title}
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-balance text-sm text-slate-500 dark:text-slate-400">
              {closingCta.description}
            </p>
            <Link
              href="/signup"
              className="relative mt-7 inline-flex items-center justify-center rounded-full bg-primary-solid px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:-translate-y-0.5 hover:bg-primary-600"
            >
              {closingCta.cta}
            </Link>

          </div>
        </Reveal>
      </section>

      <footer className="border-t border-primary-100 px-4 py-12 dark:border-slate-800">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Logo />
              <p className="mt-3 max-w-xs text-xs text-slate-500 dark:text-slate-400">
                {siteConfig.description}
              </p>
            </div>

            <FooterColumn title="Bantuan" links={footerLinks.bantuan} />
          </div>

          <div className="mt-10 border-t border-primary-100 pt-6 text-center text-xs text-slate-400 dark:border-slate-800">
            &copy; 2026 {siteConfig.name}. Seluruh hak cipta dilindungi.
          </div>
        </div>
      </footer>
    </>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {links.map((link) => (
          <li key={link.label}>
            <a
              href={link.href}
              className="text-sm text-slate-600 transition hover:text-primary-500 dark:text-slate-300"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

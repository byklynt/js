import { footerLinks, siteConfig } from "@/lib/landing-data";
import { Logo } from "@/components/shared/logo";

export function SiteFooter() {
  return (
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

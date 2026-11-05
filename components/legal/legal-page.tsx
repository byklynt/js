import Link from "next/link";
import { CommunityLegalFooter } from "@/components/legal/legal-footer-server";
import { Logo } from "@/components/shared/logo";

/** Plain, theme-aware shell for the public pages (terms, refund policy, status, maintenance). */
export function LegalPage({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-200">
      <header className="border-b border-primary-100 px-4 py-4 dark:border-slate-800">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Logo />
          <Link href="/dashboard" className="text-sm font-medium text-primary-600 hover:underline dark:text-primary-300">
            Ke dasbor
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        <div className="mt-8 space-y-6 text-sm leading-relaxed">{children}</div>
      </main>
      <CommunityLegalFooter />
    </div>
  );
}

export const H2 = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mb-2 text-base font-bold text-slate-900 dark:text-white">{children}</h2>
);

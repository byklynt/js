import { Navbar } from "./navbar";
import { SiteFooter } from "./site-footer";

/** Shell for public pages (/services, /blog): the landing navbar and footer around the content. */
export function PublicPage({ title, subtitle, children, narrow }: { title: string; subtitle?: string; children: React.ReactNode; narrow?: boolean }) {
  return (
    <>
      <Navbar />
      <main className="min-h-[var(--app-h)] bg-white px-4 pb-20 pt-32 dark:bg-slate-950">
        <div className={`mx-auto ${narrow ? "max-w-3xl" : "max-w-5xl"}`}>
          <h1 className="text-balance text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

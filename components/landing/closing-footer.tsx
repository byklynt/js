import Link from "next/link";
import { TrendingUp } from "lucide-react";
import { stats } from "@/lib/landing-content";
import { siteConfig as siteFlags } from "@/lib/site-config";
import { closingCta } from "@/lib/landing-data";
import { SiteFooter } from "./site-footer";
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

            {siteFlags.showSocialProof && stats.length > 0 ? (
              <div className="relative mt-10 flex flex-wrap items-center justify-center gap-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="flex w-fit items-center gap-3 rounded-2xl border border-primary-100 bg-white px-5 py-3 text-left shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-50 text-primary-500 dark:bg-primary-950/60 dark:text-primary-300">
                      <TrendingUp className="h-4 w-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-[11px] text-slate-400">{stat.label}</span>
                      <span className="block text-sm font-extrabold text-slate-900 dark:text-white">{stat.value}</span>
                    </span>
                    {stat.change ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {stat.change}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </Reveal>
      </section>

      <SiteFooter />
    </>
  );
}

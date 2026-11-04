import { ArrowRight, Leaf } from "lucide-react";
import { resellerCta } from "@/lib/landing-data";
import { Reveal } from "./reveal";

export function ResellerCta() {
  return (
    <section className="px-4 pb-10">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-3xl border border-primary-100 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-12">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-6 -top-6 text-primary-100 dark:text-primary-950/60"
          >
            <Leaf className="h-40 w-40 rotate-45" strokeWidth={1} />
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-10 right-16 text-primary-100 dark:text-primary-950/60"
          >
            <Leaf className="h-24 w-24 -rotate-12" strokeWidth={1} />
          </div>

          <div className="relative max-w-md">
            <h2 className="text-balance text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
              {resellerCta.title}
            </h2>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {resellerCta.description}
            </p>
            <a
              href="#reseller"
              className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary-solid px-6 py-3 text-sm font-semibold text-white shadow-sm shadow-primary-500/30 transition hover:bg-primary-600"
            >
              {resellerCta.cta}
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

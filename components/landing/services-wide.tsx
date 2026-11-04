import Link from "next/link";
import { Flame, UserPlus } from "lucide-react";
import { servicesGalore } from "@/lib/landing-data";
import { Reveal } from "./reveal";

const avatars = ["bg-primary-200", "bg-primary-300", "bg-primary-400", "bg-primary-500"];

export function ServicesWide() {
  return (
    <section className="px-4 pb-20">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-3xl border border-primary-100 bg-primary-500 px-6 py-14 text-center shadow-xl shadow-primary-500/20 dark:border-primary-900 sm:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[640px] w-[640px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/20"
          />

          <div className="relative mx-auto mb-8 flex w-fit items-center gap-3 rounded-2xl border border-white/30 bg-white/10 px-4 py-2.5 backdrop-blur-sm">
            <div className="flex -space-x-2">
              {avatars.map((c, i) => (
                <span
                  key={i}
                  className={`h-7 w-7 rounded-full border-2 border-primary-500 ${c}`}
                />
              ))}
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary-600">
              <UserPlus className="h-3 w-3" />
              Follow
            </span>
          </div>

          <span className="relative inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold text-white">
            <Flame className="h-3.5 w-3.5" />
            {servicesGalore.badge}
          </span>

          <h2 className="relative mx-auto mt-5 max-w-xl text-balance text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {servicesGalore.title}
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-balance text-sm text-primary-50/90 sm:text-base">
            {servicesGalore.description}
          </p>

          <Link
            href="/signup"
            className="relative mt-7 inline-flex items-center justify-center rounded-full bg-white px-7 py-3 text-sm font-semibold text-primary-600 shadow-lg transition hover:-translate-y-0.5 hover:bg-primary-50"
          >
            {servicesGalore.cta}
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

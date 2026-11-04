import { ArrowRight, BadgeCheck, Heart, Repeat2, Globe2 } from "lucide-react";
import { SiX } from "react-icons/si";
import { bentoFeatures } from "@/lib/landing-data";
import { SectionBadge } from "./section-badge";
import { Reveal } from "./reveal";

const notifications = [
  { icon: Heart, text: "128 orang menyukai postinganmu", time: "2m" },
  { icon: Repeat2, text: "54 repost baru masuk", time: "8m" },
  { icon: BadgeCheck, text: "Followers bertambah +230", time: "15m" },
];

export function BentoFeatures() {
  return (
    <section id="layanan" className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="text-center">
          <Reveal className="flex justify-center">
            <SectionBadge>{bentoFeatures.badge}</SectionBadge>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="mx-auto mt-5 max-w-2xl text-balance text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              {bentoFeatures.title}
            </h2>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <Reveal>
            <div className="h-full overflow-hidden rounded-3xl border border-primary-100 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                <SiX className="h-4 w-4" />
                Panel X (Twitter) yang Dinamis
              </div>
              <div className="mt-6 space-y-3 rounded-2xl bg-primary-50/70 p-4 dark:bg-slate-800/60">
                {notifications.map((n, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 rounded-xl border border-primary-100 bg-white px-3 py-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-primary-500">
                      <n.icon className="h-4 w-4" />
                    </span>
                    <span className="flex-1 text-xs text-slate-600 dark:text-slate-300">
                      {n.text}
                    </span>
                    <span className="text-[10px] text-slate-400">{n.time}</span>
                  </div>
                ))}
              </div>
              <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">
                {bentoFeatures.cards[0].description}
              </p>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="relative h-full overflow-hidden rounded-3xl border border-primary-100 bg-gradient-to-br from-primary-50 to-white p-6 shadow-sm dark:border-slate-800 dark:from-slate-800/60 dark:to-slate-900 sm:p-8">
              <div
                aria-hidden
                className="bg-dot-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_70%_60%_at_60%_40%,black,transparent)]"
              />
              <div className="relative flex h-full flex-col justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  <Globe2 className="h-4 w-4 text-primary-500" />
                  Jangkauan Global
                </div>
                <div className="my-10">
                  <h3 className="text-balance text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl dark:text-white">
                    Panel <span className="text-primary-500">YouTube</span> Original
                  </h3>
                  <p className="mt-3 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                    {bentoFeatures.cards[1].description}
                  </p>
                </div>
                <a
                  href="#layanan"
                  className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-solid px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-500/30 transition hover:bg-primary-600"
                >
                  {bentoFeatures.cards[1].cta}
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

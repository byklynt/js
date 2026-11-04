import { featureColumns, massOrder } from "@/lib/landing-data";
import { Reveal } from "./reveal";

export function FeatureColumns() {
  return (
    <section className="px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <div className="grid gap-10 lg:grid-cols-5 lg:items-center">
          <Reveal className="lg:col-span-2">
            <p className="text-balance text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              {massOrder.title}
            </p>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              {massOrder.description}
            </p>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-3 lg:col-span-3">
            {featureColumns.map((feature, i) => (
              <Reveal key={feature.title} delay={i * 0.1}>
                <div className="h-full rounded-3xl border border-primary-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-500 dark:bg-primary-950/60 dark:text-primary-300">
                    <feature.icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                    {feature.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

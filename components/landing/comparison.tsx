import { Check, X } from "lucide-react";
import { comparison } from "@/lib/landing-content";
import { Reveal } from "./reveal";

function Mark({ yes }: { yes: boolean }) {
  return yes ? (
    <>
      <Check className="h-4 w-4 text-primary-500" aria-hidden />
      <span className="sr-only">Ya</span>
    </>
  ) : (
    <>
      <X className="h-4 w-4 text-red-400" aria-hidden />
      <span className="sr-only">Tidak</span>
    </>
  );
}

export function Comparison() {
  if (comparison.rows.length === 0) return null;
  const { columns } = comparison;
  return (
    <section className="px-4 py-20" aria-label="Perbandingan dengan kompetitor">
      <div className="mx-auto max-w-4xl">
        <Reveal className="text-center">
          <h2 className="text-balance text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            {comparison.title}
          </h2>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="mt-12 overflow-hidden rounded-3xl border border-primary-100 shadow-sm dark:border-slate-800">
            <div className="grid grid-cols-3 bg-slate-50 text-xs font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400 sm:text-sm">
              <div className="px-3 py-4 sm:px-4">{columns.feature}</div>
              <div className="px-2 py-4 text-center sm:px-4">{columns.competitor}</div>
              <div className="bg-primary-solid px-2 py-4 text-center text-white sm:px-4">{columns.us}</div>
            </div>

            {comparison.rows.map((row, i) => (
              <div
                key={row.label}
                className={`grid grid-cols-3 items-center text-xs sm:text-sm ${
                  i % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50/60 dark:bg-slate-900/60"
                }`}
              >
                <div className="px-3 py-4 font-medium text-slate-600 sm:px-4 dark:text-slate-300">{row.label}</div>
                <div className="flex justify-center px-2 py-4 sm:px-4">
                  <Mark yes={row.competitor} />
                </div>
                <div className="flex justify-center bg-primary-50/70 px-2 py-4 sm:px-4 dark:bg-primary-950/30">
                  <Mark yes={row.us} />
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

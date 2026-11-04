import { Star } from "lucide-react";
import { testimonials, ratingSummary } from "@/lib/landing-data";
import { SectionBadge } from "./section-badge";
import { Reveal } from "./reveal";

const rowOne = testimonials.slice(0, 4);
const rowTwo = testimonials.slice(4, 8);

function TestimonialCard({ item }: { item: (typeof testimonials)[number] }) {
  return (
    <div className="w-80 shrink-0 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-300 to-primary-500 text-xs font-bold text-white">
          {item.name.charAt(0)}
        </span>
        <div>
          <p className="text-xs font-bold text-slate-900 dark:text-white">
            {item.name}
          </p>
          <p className="text-[11px] text-slate-400">{item.handle}</p>
        </div>
      </div>
      <div className="mt-3 flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-3.5 w-3.5 ${
              i < item.rating
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
        {item.text}
      </p>
    </div>
  );
}

export function Testimonials() {
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[2.5rem] border border-primary-100 bg-primary-50/50 py-14 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="px-4 text-center">
            <Reveal className="flex justify-center">
              <SectionBadge icon={Star}>Testimoni</SectionBadge>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                Apa kata pelanggan kami?
              </h2>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mx-auto mt-4 max-w-xl text-balance text-slate-500 dark:text-slate-400">
                Kami menghargai pelanggan dan layanan kami. Lihat apa yang mereka
                katakan.
              </p>
            </Reveal>
          </div>

          <div className="pause-on-hover mt-10 space-y-5 overflow-hidden">
            <div className="flex w-max animate-marquee-left-slow gap-5">
              {[...rowOne, ...rowOne].map((item, i) => (
                <TestimonialCard key={`r1-${i}`} item={item} />
              ))}
            </div>
            <div className="flex w-max animate-marquee-right-slow gap-5">
              {[...rowTwo, ...rowTwo].map((item, i) => (
                <TestimonialCard key={`r2-${i}`} item={item} />
              ))}
            </div>
          </div>

          {ratingSummary ? (
            <Reveal className="mt-10 flex justify-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {ratingSummary.score} &middot; {ratingSummary.label}
              </span>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  );
}

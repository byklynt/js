import { Star } from "lucide-react";
import { rating, testimonials, testimonialsSection, type Testimonial } from "@/lib/landing-content";
import { SectionBadge } from "./section-badge";
import { Reveal } from "./reveal";

function TestimonialCard({ item }: { item: Testimonial }) {
  return (
    <figure className="w-72 shrink-0 rounded-3xl border border-primary-100 bg-white p-5 shadow-sm sm:w-80 dark:border-slate-800 dark:bg-slate-900">
      <figcaption className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-primary-300 to-primary-500 text-xs font-bold text-white"
        >
          {item.avatarInitial}
        </span>
        <span>
          <span className="block text-xs font-bold text-slate-900 dark:text-white">{item.name}</span>
          {item.role ? <span className="block text-[11px] text-slate-400">{item.role}</span> : null}
        </span>
      </figcaption>
      <div className="mt-3 flex gap-0.5" role="img" aria-label={`Rating ${item.rating} dari 5`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            aria-hidden
            className={`h-3.5 w-3.5 ${
              i < item.rating
                ? "fill-amber-400 text-amber-400"
                : "fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700"
            }`}
          />
        ))}
      </div>
      <blockquote className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{item.text}</blockquote>
    </figure>
  );
}

function MarqueeRow({ items, direction, label }: { items: Testimonial[]; direction: "left" | "right"; label: string }) {
  if (items.length === 0) return null;
  const anim = direction === "left" ? "animate-marquee-left-slow" : "animate-marquee-right-slow";
  return (
    <div className="marquee-viewport overflow-hidden" role="group" aria-label={label}>
      <div className={`flex w-max ${anim}`}>
        <div className="flex gap-5 pr-5">
          {items.map((item, i) => (
            <TestimonialCard key={i} item={item} />
          ))}
        </div>
        {/* Visual duplicate for the seamless loop; hidden from assistive tech. */}
        <div className="marquee-dup flex gap-5 pr-5" aria-hidden="true">
          {items.map((item, i) => (
            <TestimonialCard key={i} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function Testimonials() {
  if (testimonials.length === 0) return null;
  const half = Math.ceil(testimonials.length / 2);
  const rowOne = testimonials.slice(0, half);
  const rowTwo = testimonials.slice(half);

  return (
    <section className="px-4 py-20" aria-label={testimonialsSection.regionLabel}>
      <div className="mx-auto max-w-6xl">
        <div className="rounded-[2.5rem] border border-primary-100 bg-primary-50/50 py-14 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="px-4 text-center">
            <Reveal className="flex justify-center">
              <SectionBadge icon={Star}>{testimonialsSection.badge}</SectionBadge>
            </Reveal>
            <Reveal delay={0.1}>
              <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                {testimonialsSection.title}
              </h2>
            </Reveal>
            <Reveal delay={0.2}>
              <p className="mx-auto mt-4 max-w-xl text-balance text-slate-500 dark:text-slate-400">
                {testimonialsSection.subtitle}
              </p>
            </Reveal>
          </div>

          <div className="pause-on-hover mt-10 space-y-5">
            <MarqueeRow items={rowOne} direction="left" label={`${testimonialsSection.regionLabel}, baris 1`} />
            <MarqueeRow items={rowTwo} direction="right" label={`${testimonialsSection.regionLabel}, baris 2`} />
          </div>

          {rating ? (
            <Reveal className="mt-10 flex justify-center px-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                {rating.score} &middot; {rating.count} Ulasan
              </span>
            </Reveal>
          ) : null}
        </div>
      </div>
    </section>
  );
}

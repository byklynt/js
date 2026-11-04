import { Star } from "lucide-react";
import { socialProof } from "@/lib/landing-content";
import { SectionBadge } from "./section-badge";
import { Reveal } from "./reveal";

export function SocialProof() {
  if (!socialProof.title) return null;
  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-2xl text-center">
        <Reveal className="flex justify-center">
          {socialProof.badge ? <SectionBadge icon={Star}>{socialProof.badge}</SectionBadge> : null}
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className="mt-5 text-balance text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            {socialProof.title}
          </h2>
        </Reveal>
        {socialProof.subtitle ? (
          <Reveal delay={0.2}>
            <p className="mt-4 text-balance text-slate-500 dark:text-slate-400">
              {socialProof.subtitle}
            </p>
          </Reveal>
        ) : null}
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Zap } from "lucide-react";
import { platformMarquee, floatingSocialIcons } from "@/lib/landing-data";
import { claims, hero } from "@/lib/landing-content";
import { siteConfig } from "@/lib/site-config";
import { SectionBadge } from "./section-badge";

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden bg-gradient-to-b from-primary-50 via-white to-white pt-36 pb-20 dark:from-primary-950/40 dark:via-slate-950 dark:to-slate-950"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_srgb,var(--primary-200)_60%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,color-mix(in_srgb,var(--primary-900)_40%,transparent),transparent)]"
      />

      {floatingSocialIcons.map((item, i) => {
        const Icon = item.icon;
        return (
          <div
            key={i}
            className={`absolute hidden animate-float-slow items-center justify-center rounded-2xl border border-primary-100 bg-white/80 p-3 shadow-md shadow-primary-100 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/80 dark:shadow-none lg:flex ${item.position}`}
            style={{ animationDelay: item.delay }}
          >
            <Icon className="h-5 w-5 text-primary-500" />
          </div>
        );
      })}

      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 text-center">
        <Reveal>
          <SectionBadge>{hero.badge}</SectionBadge>
        </Reveal>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: "easeOut" }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-balance text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl dark:text-white"
        >
          <span className="text-primary-500">{hero.highlight}</span>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 shadow-lg shadow-primary-500/40 sm:h-12 sm:w-12">
            <Zap className="h-5 w-5 fill-white text-white sm:h-6 sm:w-6" />
          </span>
          <span>{hero.headline}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          className="mt-5 max-w-xl text-balance text-base text-slate-500 sm:text-lg dark:text-slate-400"
        >
          {hero.description}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: "easeOut" }}
          className="mt-7"
        >
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-full bg-primary-solid px-7 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition hover:-translate-y-0.5 hover:bg-primary-600"
          >
            Masuk Sekarang
          </Link>
        </motion.div>

        {siteConfig.showSocialProof && claims.length > 0 ? (
        <Reveal delay={0.1} className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {claims.map((badge) => (
            <span
              key={badge.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary-100 bg-white/80 px-3.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300"
            >
              <badge.icon className="h-3.5 w-3.5 text-primary-500" />
              {badge.label}
            </span>
          ))}
        </Reveal>
        ) : null}
      </div>

      <div className="relative mt-14 overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent dark:from-slate-950 sm:w-32" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent dark:from-slate-950 sm:w-32" />
        <div className="flex w-max animate-marquee-left gap-10 pr-10">
          {[...platformMarquee, ...platformMarquee].map((item, i) => (
            <span
              key={`${item.label}-${i}`}
              className="flex items-center gap-2 text-lg font-semibold text-slate-300 dark:text-slate-700"
            >
              <item.icon className="h-5 w-5" aria-hidden />
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

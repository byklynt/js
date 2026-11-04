"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { faqLeft, faqRight } from "@/lib/landing-data";
import { SectionBadge } from "./section-badge";
import { Reveal } from "./reveal";
import { cn } from "@/lib/utils";

type FaqItem = { question: string; answer: string };

function FaqAccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-2xl border border-primary-100 bg-white dark:border-slate-800 dark:bg-slate-900">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left text-sm font-semibold text-slate-800 dark:text-slate-100"
      >
        {item.question}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-primary-500 transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-all duration-300 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-4 text-sm text-slate-500 dark:text-slate-400">
            {item.answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  const [openId, setOpenId] = useState<string | null>("left-0");

  const toggle = (id: string) =>
    setOpenId((current) => (current === id ? null : id));

  return (
    <section className="px-4 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-center">
          <Reveal className="flex justify-center">
            <SectionBadge icon={HelpCircle}>Pertanyaan Umum</SectionBadge>
          </Reveal>
          <Reveal delay={0.1}>
            <h2 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              Frequently Asked Questions
            </h2>
          </Reveal>
          <Reveal delay={0.2}>
            <p className="mx-auto mt-4 max-w-md text-balance text-slate-500 dark:text-slate-400">
              Masih ada yang ingin ditanyakan? Mungkin jawabannya ada di sini.
            </p>
          </Reveal>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            {faqLeft.map((item, i) => (
              <Reveal key={item.question} delay={i * 0.05}>
                <FaqAccordionItem
                  item={item}
                  isOpen={openId === `left-${i}`}
                  onToggle={() => toggle(`left-${i}`)}
                />
              </Reveal>
            ))}
          </div>
          <div className="space-y-4">
            {faqRight.map((item, i) => (
              <Reveal key={item.question} delay={i * 0.05}>
                <FaqAccordionItem
                  item={item}
                  isOpen={openId === `right-${i}`}
                  onToggle={() => toggle(`right-${i}`)}
                />
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

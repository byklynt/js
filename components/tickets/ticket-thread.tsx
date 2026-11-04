"use client";

import { useEffect, useRef } from "react";
import type { TicketMessage } from "@/lib/tickets-data";
import { cn } from "@/lib/utils";
import { TicketAttachments } from "./ticket-attachments";

const stampParts = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta",
});

/** "2026-11-04 17:02:17" in Jakarta time (fixed zone: server and browser render the same text). */
export function formatStamp(iso: string): string {
  const p = Object.fromEntries(stampParts.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

/**
 * The conversation: one centered column (max 560px), messages stacked at the bottom, scrolling on its own and
 * jumping to the newest message on load and whenever one is added. Shared by the user detail page and /admin/tickets.
 * Text is always rendered as plain text (never HTML).
 */
export function TicketThread({ messages, username, className }: { messages: TicketMessage[]; username: string; className?: string }) {
  const scroller = useRef<HTMLDivElement>(null);

  const lastId = messages.at(-1)?.id;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastId]);

  return (
    <div ref={scroller} className={cn("thin-scroll min-h-0 flex-1 overflow-y-auto", className)}>
      <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col justify-end px-4 py-4">
        <ul aria-label="Percakapan tiket" aria-live="polite" className="space-y-3">
          {messages.map((m) => {
            const support = m.from === "support";
            return (
              <li key={m.id} className="list-none">
                <article
                  className={cn(
                    "rounded-2xl border px-4 pt-3.5 pb-2.5",
                    support
                      ? "border-primary-200/80 bg-primary-soft dark:border-primary-border"
                      : "border-slate-200/80 bg-primary-50 dark:border-slate-800 dark:bg-slate-900"
                  )}
                >
                  <p className="text-[12px] leading-relaxed [overflow-wrap:anywhere] whitespace-pre-wrap text-ink dark:text-slate-100">{m.text}</p>
                  <TicketAttachments attachments={m.attachments} />
                  <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-slate-200/80 pt-2 dark:border-slate-700/70">
                    {support ? (
                      <span className="rounded-full bg-primary-solid px-2 py-0.5 text-[9px] font-semibold text-white">Support</span>
                    ) : null}
                    <time dateTime={m.at} className="text-[10px] text-[#5B6B8C] dark:text-slate-400">
                      {support ? "Support" : username} - {formatStamp(m.at)}
                    </time>
                  </div>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

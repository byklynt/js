"use client";

import { useState } from "react";
import { Download, FileText } from "lucide-react";
import type { TicketAttachment } from "@/lib/tickets-data";
import { Dialog } from "@/components/ui/dialog";

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Images as thumbnails (click = lightbox), other files as chips with a download link. */
export function TicketAttachments({ attachments }: { attachments?: TicketAttachment[] }) {
  const [open, setOpen] = useState<TicketAttachment | null>(null);
  if (!attachments?.length) return null;
  return (
    <>
      <ul aria-label="Lampiran" className="mt-2.5 flex flex-wrap gap-2">
        {attachments.map((a) => (
          <li key={a.id} className="list-none">
            {a.type.startsWith("image/") ? (
              <button
                type="button"
                onClick={() => setOpen(a)}
                aria-label={`Lihat gambar ${a.name}`}
                className="block overflow-hidden rounded-xl border border-slate-200/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url} alt={a.name} className="h-16 w-16 object-cover" />
              </button>
            ) : (
              <a
                href={a.url}
                download={a.name}
                aria-label={`Unduh ${a.name} (${formatFileSize(a.size)})`}
                className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-white py-1.5 pr-3 pl-2.5 text-[10px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <FileText className="h-3.5 w-3.5 text-primary-accent" aria-hidden />
                <span className="max-w-[140px] truncate">{a.name}</span>
                <span className="text-[#5B6B8C] dark:text-slate-400">{formatFileSize(a.size)}</span>
                <Download className="h-3 w-3" aria-hidden />
              </a>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={Boolean(open)} onClose={() => setOpen(null)} title={open?.name ?? "Gambar"} maxWidth="max-w-2xl">
        {open ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={open.url} alt={open.name} className="mx-auto max-h-[70vh] w-auto rounded-xl" />
        ) : null}
      </Dialog>
    </>
  );
}

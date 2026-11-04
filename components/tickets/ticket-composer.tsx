"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Paperclip, Send, X } from "lucide-react";
import { allowedAttachmentTypes, maxAttachmentBytes, maxAttachments, maxMessageLength } from "@/lib/tickets-data";
import { cn } from "@/lib/utils";
import { formatFileSize } from "./ticket-attachments";

const LINE = 18;
const MAX_LINES = 5;

/**
 * Message bar: rounded-full, grows up to 5 lines (then becomes rounded-2xl), a 32px upload button and a 36px send
 * button. Enter sends, Shift+Enter adds a newline. `onSend` returns true when the message was accepted; on false the
 * text and files stay so the user can retry. Shared by the user detail page and /admin/tickets.
 */
export function TicketComposer({
  onSend,
  disabled = false,
  disabledNote,
  initialText = "",
  className,
}: {
  onSend: (text: string, files: File[]) => Promise<boolean>;
  disabled?: boolean;
  /** Shown instead of the bar when the ticket is closed. */
  disabledNote?: string;
  /** Pre-filled text (for example a canned reply). Remount with a new `key` to change it. */
  initialText?: string;
  className?: string;
}) {
  const inputId = useId();
  const errorId = useId();
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [multiline, setMultiline] = useState(false);

  // Grow with the content up to 5 lines.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lines = Math.min(MAX_LINES, Math.max(1, Math.round(el.scrollHeight / LINE)));
    el.style.height = `${lines * LINE}px`;
    setMultiline(lines > 1);
  }, [text]);

  const canSend = text.trim().length > 0 && !sending;

  async function send() {
    if (!canSend) return;
    setSending(true);
    setError("");
    const ok = await onSend(text.trim(), files);
    setSending(false);
    if (ok) {
      setText("");
      setFiles([]);
      areaRef.current?.focus();
    } else {
      setError("Pesan belum terkirim. Tekan Kirim untuk mencoba lagi.");
    }
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    let message = "";
    const next = [...files];
    for (const f of picked) {
      if (!allowedAttachmentTypes.includes(f.type)) message = `${f.name}: format harus PNG, JPG, atau PDF.`;
      else if (f.size > maxAttachmentBytes) message = `${f.name}: ukuran maksimal 5 MB.`;
      else if (next.length >= maxAttachments) message = `Maksimal ${maxAttachments} file.`;
      else next.push(f);
    }
    setError(message);
    setFiles(next);
  }

  if (disabled) {
    return (
      <div className={cn("mx-auto w-full max-w-[560px] px-4 pb-[max(12px,env(safe-area-inset-bottom))]", className)}>
        <div aria-disabled="true" className="flex h-12 items-center rounded-full border border-slate-200 bg-slate-50 px-5 text-[11px] text-slate-400 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-500">
          {disabledNote ?? "Tiket ini sudah ditutup."}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto w-full max-w-[560px] px-4 pb-[max(12px,env(safe-area-inset-bottom))]", className)}>
      {files.length > 0 ? (
        <ul aria-label="File terlampir" className="mb-2 flex flex-wrap gap-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-slate-50 py-1 pr-1 pl-3 text-[9.5px] font-medium text-ink dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
              <span className="max-w-[140px] truncate" title={f.name}>{f.name}</span>
              <span className="text-[#5B6B8C] dark:text-slate-400">{formatFileSize(f.size)}</span>
              <button type="button" aria-label={`Hapus ${f.name}`} onClick={() => setFiles(files.filter((_, idx) => idx !== i))} className="flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-primary dark:hover:bg-slate-700">
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="mb-1.5 px-2 text-[10px] font-medium text-red-500">{error}</p>
      ) : null}
      <div
        className={cn(
          "flex items-end gap-2 border border-slate-200 bg-white py-1.5 pr-1.5 pl-4 transition focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30 dark:border-slate-700 dark:bg-slate-900",
          multiline ? "rounded-2xl" : "rounded-full"
        )}
      >
        <label htmlFor={inputId} className="sr-only">Pesan</label>
        <textarea
          id={inputId}
          ref={areaRef}
          rows={1}
          value={text}
          maxLength={maxMessageLength}
          placeholder="Pesan"
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          style={{ height: LINE }}
          className="my-[7px] min-w-0 flex-1 resize-none bg-transparent text-[12px] leading-[18px] text-ink outline-none placeholder:text-slate-400 dark:text-white dark:placeholder:text-slate-500"
        />
        <input ref={fileRef} type="file" multiple accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf" onChange={pick} className="sr-only" tabIndex={-1} aria-hidden />
        <button
          type="button"
          aria-label="Lampirkan file"
          onClick={() => fileRef.current?.click()}
          className="flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-full border border-slate-200 text-primary-accent transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:hover:bg-slate-800"
        >
          <Paperclip className="h-4 w-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Kirim"
          disabled={!canSend}
          onClick={() => void send()}
          className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-full bg-primary text-white transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

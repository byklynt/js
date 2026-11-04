"use client";

import { useId, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { maxAttachmentBytes, maxAttachments } from "@/lib/tickets-data";
import { cn } from "@/lib/utils";

const allowedTypes = ["image/png", "image/jpeg", "application/pdf"];

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function FileAttach({
  files,
  onChange,
  label = "Lampirkan file",
  variant = "block",
}: {
  files: File[];
  onChange: (next: File[]) => void;
  label?: string;
  variant?: "block" | "inline";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const errorId = useId();

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    let message = "";
    const next = [...files];
    for (const file of picked) {
      if (!allowedTypes.includes(file.type)) {
        message = `${file.name}: format harus PNG, JPG, atau PDF.`;
      } else if (file.size > maxAttachmentBytes) {
        message = `${file.name}: ukuran maksimal 5 MB.`;
      } else if (next.length >= maxAttachments) {
        message = `Maksimal ${maxAttachments} file.`;
      } else {
        next.push(file);
      }
    }
    setError(message);
    onChange(next);
  }

  return (
    <div className={cn(variant === "block" && "flex flex-col items-center")}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".png,.jpg,.jpeg,.pdf,image/png,image/jpeg,application/pdf"
        onChange={handlePick}
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        aria-describedby={error ? errorId : undefined}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex items-center justify-center gap-2 border border-slate-200 text-[10px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800",
          variant === "block" ? "h-9 w-full max-w-[256px] rounded-xl" : "h-9 rounded-xl px-3.5"
        )}
      >
        <Paperclip className="h-3.5 w-3.5 text-primary-accent" aria-hidden />
        {label}
      </button>
      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-[9.5px] font-medium text-red-500">
          {error}
        </p>
      ) : null}
      {files.length > 0 ? (
        <ul
          aria-label="File terlampir"
          className={cn(
            "mt-2 flex flex-wrap gap-1.5",
            variant === "block" && "w-full justify-center"
          )}
        >
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-1.5 rounded-full border border-slate-200/70 bg-slate-50 py-1 pr-1 pl-3 text-[9.5px] font-medium text-ink dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <span className="max-w-[140px] truncate" title={file.name}>
                {file.name}
              </span>
              <span className="text-[#5B6B8C] dark:text-slate-400">{formatSize(file.size)}</span>
              <button
                type="button"
                aria-label={`Hapus ${file.name}`}
                onClick={() => onChange(files.filter((_, idx) => idx !== i))}
                className="flex h-5 w-5 items-center justify-center rounded-full transition hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

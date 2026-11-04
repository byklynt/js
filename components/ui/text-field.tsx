"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

const inputClass =
  "h-[34px] w-full rounded-xl border bg-white px-3.5 text-[10px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary-ring focus:shadow-[0_0_0_5px_var(--primary-soft)] read-only:bg-[#F1F6FB] read-only:text-[#5B6B8C] dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-600 dark:read-only:bg-[#161b20] dark:read-only:text-slate-400";

export type TextFieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
};

/** Labelled input with inline error text (aria-invalid + aria-describedby). */
export function TextField({ label, error, hint, className, ...props }: TextFieldProps) {
  const id = useId();
  const messageId = useId();
  const described = error || hint ? messageId : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={described}
        className={cn(
          inputClass,
          error ? "border-red-300 dark:border-red-900" : "border-slate-200 dark:border-slate-700",
          className
        )}
        {...props}
      />
      {error ? (
        <p id={messageId} className="mt-1.5 text-[9.5px] font-medium text-red-500">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** TextField with a show/hide (eye) button. */
export function PasswordField({ label, error, hint, className, ...props }: TextFieldProps) {
  const id = useId();
  const messageId = useId();
  const [visible, setVisible] = useState(false);
  const described = error || hint ? messageId : undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? "text" : "password"}
          aria-invalid={Boolean(error)}
          aria-describedby={described}
          className={cn(
            inputClass,
            "pr-10",
            error ? "border-red-300 dark:border-red-900" : "border-slate-200 dark:border-slate-700",
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? `Sembunyikan ${label.toLowerCase()}` : `Tampilkan ${label.toLowerCase()}`}
          aria-pressed={visible}
          className="absolute top-1/2 right-1.5 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-[#5B6B8C] transition hover:text-ink focus-visible:outline-2 focus-visible:outline-primary dark:text-slate-400 dark:hover:text-white"
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error ? (
        <p id={messageId} className="mt-1.5 text-[9.5px] font-medium text-red-500">
          {error}
        </p>
      ) : hint ? (
        <p id={messageId} className="mt-1.5 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const primaryButtonClass =
  "flex h-[38px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-from to-primary-to text-[10px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border dark:border-white/25 dark:shadow-[0_2px_0_var(--primary-pressed)]";

export const outlineButtonClass =
  "flex h-9 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-[10px] font-medium text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800";

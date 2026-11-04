"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Labelled textarea with inline error (aria-invalid + aria-describedby). */
export function Textarea({
  label,
  error,
  hint,
  className,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & {
  label: string;
  error?: string;
  hint?: string;
}) {
  const id = useId();
  const messageId = useId();

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? messageId : undefined}
        className={cn(
          "min-h-[96px] w-full resize-y rounded-xl border bg-white px-3.5 py-2.5 text-[10px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary-ring focus:shadow-[0_0_0_5px_var(--primary-soft)] dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-600",
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

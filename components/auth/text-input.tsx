"use client";

import { useId } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  type = "text",
  autoComplete,
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  type?: string;
  autoComplete?: string;
  icon: LucideIcon;
}) {
  const inputId = useId();
  const errorId = useId();

  return (
    <div>
      <label
        htmlFor={inputId}
        className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
      >
        {label}
      </label>
      <div className="relative">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 dark:text-slate-600" />
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          autoCapitalize={autoComplete === "username" || type === "email" ? "none" : undefined}
          autoCorrect={autoComplete === "username" || type === "email" ? "off" : undefined}
          spellCheck={autoComplete === "username" || type === "email" ? false : undefined}
          inputMode={type === "email" ? "email" : undefined}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "w-full rounded-xl border bg-white py-2.5 pl-10 pr-3.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-300 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:ring-primary-900/40",
            error
              ? "border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-900"
              : "border-slate-200 dark:border-slate-700"
          )}
        />
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

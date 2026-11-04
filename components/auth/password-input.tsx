"use client";

import { useId, useState } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

export function PasswordInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  autoComplete?: string;
}) {
  const [visible, setVisible] = useState(false);
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
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300 dark:text-slate-600" />
        <input
          id={inputId}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : undefined}
          className={cn(
            "w-full rounded-xl border bg-white py-2.5 pl-10 pr-11 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-300 focus:border-primary-400 focus:ring-4 focus:ring-primary-100 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:ring-primary-900/40",
            error
              ? "border-red-300 focus:border-red-400 focus:ring-red-100 dark:border-red-900"
              : "border-slate-200 dark:border-slate-700"
          )}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Sembunyikan password" : "Tampilkan password"}
          className="absolute right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-slate-400 transition hover:text-primary-500"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error ? (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-red-500">
          {error}
        </p>
      ) : null}
    </div>
  );
}

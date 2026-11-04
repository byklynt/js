"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { outlineButtonClass, primaryButtonClass } from "./text-field";

type Variant = "primary" | "outline" | "danger" | "ghost";

const variants: Record<Variant, string> = {
  primary: cn(primaryButtonClass, "h-[38px] w-auto px-5"),
  outline: outlineButtonClass,
  danger:
    "flex h-9 items-center justify-center gap-2 rounded-xl bg-red-500 px-5 text-[10px] font-semibold text-white shadow-[0_2px_0_#b91c1c] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-[10px] font-medium text-[#5B6B8C] transition hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 dark:text-slate-400 dark:hover:text-white",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
  /** Stretch to the full width (the form-submit look: h-[38px]). */
  block?: boolean;
};

/** Shared button: primary (gradient + bottom edge), outline, danger, ghost. */
export function Button({
  variant = "primary",
  loading,
  block,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(
        variants[variant],
        block && variant === "primary" && "h-[38px] w-full",
        block && variant !== "primary" && "w-full",
        className
      )}
      {...props}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

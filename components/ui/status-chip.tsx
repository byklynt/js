import { cn } from "@/lib/utils";

export type ChipTone = "sky" | "emerald" | "red" | "amber" | "purple" | "slate" | "indigo";

const tones: Record<ChipTone, string> = {
  sky: "bg-primary-50 text-primary-600 dark:bg-primary-500/15 dark:text-primary-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
  red: "bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300",
  purple: "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300",
  slate: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
  indigo: "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300",
};

/** Rounded-full status chip: label followed by an icon, tinted by tone. */
export function StatusChip({
  label,
  tone,
  children,
}: {
  label: string;
  tone: ChipTone;
  /** Icon element rendered after the label. */
  children?: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[10px] font-medium whitespace-nowrap",
        tones[tone]
      )}
    >
      {label}
      {children}
    </span>
  );
}

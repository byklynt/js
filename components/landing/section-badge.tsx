import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionBadge({
  children,
  icon: Icon,
  className,
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-primary-200 bg-primary-50 px-3.5 py-1.5 text-xs font-semibold text-primary-600 dark:border-primary-900 dark:bg-primary-950/60 dark:text-primary-300",
        className
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
    </span>
  );
}

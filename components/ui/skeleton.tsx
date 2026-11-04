import { cn } from "@/lib/utils";
import { RowsSkeleton } from "./list-states";

/** Shimmering placeholder block. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-shimmer rounded-md", className)} />;
}

/** Placeholder for tables / lists while data loads (400ms on first load and filter change). */
export function ListSkeleton({ label }: { label: string }) {
  return <RowsSkeleton label={label} />;
}

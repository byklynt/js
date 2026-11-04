"use client";

import { Link2 } from "lucide-react";
import { useToast } from "@/components/shared/toast";

export const chipClass =
  "flex h-9 items-center gap-2 rounded-full border border-slate-200/70 bg-white py-1 pr-3.5 pl-1 text-[10px] font-medium text-ink dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100";

export const chipFocusClass =
  "transition hover:border-primary-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

/** Tinted circular icon followed by text, used inside a chip container. */
export function ChipBody({
  icon: Icon,
  children,
  className = "",
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-accent dark:bg-primary-soft">
        <Icon className="h-3.5 w-3.5" />
      </span>
      <span className={className}>{children}</span>
    </>
  );
}

/** Static chip (icon + text). */
export function InfoChip({
  icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className={chipClass}>
      <ChipBody icon={icon}>{children}</ChipBody>
    </div>
  );
}

/** Chip showing a truncated URL; clicking copies the full URL (also in the title attribute). */
export function CopyLinkChip({ link }: { link: string }) {
  const toast = useToast();

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast("Link disalin ke papan klip");
    } catch {
      toast("Gagal menyalin link", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={link}
      aria-label={`Salin link ${link}`}
      className={`${chipClass} ${chipFocusClass} max-w-full cursor-pointer text-left sm:max-w-[320px]`}
    >
      <ChipBody icon={Link2} className="min-w-0 truncate">
        {link}
      </ChipBody>
    </button>
  );
}

import { updateTypeLabels, type UpdateType } from "@/lib/updates-data";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";

const colors: Record<UpdateType, string> = {
  baru: "text-primary-600 dark:text-primary-300",
  naik: "text-red-500 dark:text-red-300",
  turun: "text-emerald-600 dark:text-emerald-300",
  nonaktif: "text-slate-500 dark:text-slate-300",
  perubahan: "text-amber-600 dark:text-amber-300",
  pengumuman: "text-primary-600 dark:text-primary-300",
};

export function UpdateTypeLabel({ type, detail }: { type: UpdateType; detail: string }) {
  return (
    <span className="relative z-10 flex shrink-0 items-center gap-1.5">
      <span className={cn("text-[10px] font-semibold", colors[type])}>{updateTypeLabels[type]}</span>
      <InfoTooltip label={`Detail pembaruan: ${updateTypeLabels[type]}`} text={detail} />
    </span>
  );
}

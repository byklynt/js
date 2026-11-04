import { Check, Clock, LoaderCircle, X } from "lucide-react";
import { refillStatusLabels, type RefillStatus } from "@/lib/refills-data";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";

const tones: Record<RefillStatus, ChipTone> = {
  berjalan: "sky",
  selesai: "emerald",
  ditolak: "red",
  menunggu: "amber",
};

function StatusIcon({ status }: { status: RefillStatus }) {
  const cls = "h-3.5 w-3.5";
  switch (status) {
    case "berjalan":
      return (
        <LoaderCircle
          aria-hidden
          className={cn(cls, "animate-spin [animation-duration:1.6s]")}
          strokeDasharray="3 3"
        />
      );
    case "selesai":
      return <Check aria-hidden className={cls} />;
    case "ditolak":
      return <X aria-hidden className={cls} />;
    case "menunggu":
      return <Clock aria-hidden className={cls} />;
  }
}

export function RefillStatusChip({ status }: { status: RefillStatus }) {
  return (
    <StatusChip label={refillStatusLabels[status]} tone={tones[status]}>
      <StatusIcon status={status} />
    </StatusChip>
  );
}

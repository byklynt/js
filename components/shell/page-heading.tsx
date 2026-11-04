import { cn } from "@/lib/utils";

export function PageHeading({
  title,
  subtitle,
  align = "left",
  subtitleClassName,
}: {
  title: string;
  subtitle: string;
  align?: "left" | "center";
  subtitleClassName?: string;
}) {
  return (
    <div className={cn("pt-6", align === "center" && "text-center")}>
      <h1 className="text-[26px] font-semibold tracking-[-0.015em] text-ink dark:text-white">
        {title}
      </h1>
      <p className={cn("mt-1.5 text-[10px] font-medium text-[#5B6B8C] dark:text-slate-400", subtitleClassName)}>{subtitle}</p>
    </div>
  );
}

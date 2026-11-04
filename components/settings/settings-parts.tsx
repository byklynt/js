import type { LucideIcon } from "lucide-react";

/** Page title + subtitle at the top of a settings tab. */
export function SettingsPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="px-5 pt-7 pb-6 sm:px-8">
      <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink dark:text-white">{title}</h1>
      <p className="mt-1.5 text-[10px] font-medium text-[#5B6B8C] dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

/** Section with a pale-blue icon square and title; sections are divided by a full-width rule. */
export function SettingsSection({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-slate-200/70 px-5 py-6 sm:px-8 dark:border-slate-800">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-soft text-primary-accent">
          <Icon className="h-3.5 w-3.5" aria-hidden />
        </span>
        <h2 className="text-[12px] font-semibold text-ink dark:text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

import {
  ShoppingCart,
  Package,
  LayoutGrid,
  Wallet,
  Users,
  LifeBuoy,
  Bell,
  FileText,
  Code2,
  Settings,
  Activity,
  ChevronLeft,
  ChevronDown,
  Moon,
  Wallet2,
  ListOrdered,
  CreditCard,
  Clock3,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { SiInstagram } from "react-icons/si";
import { dashboardPreviewData } from "@/lib/auth-data";
import { Logo } from "@/components/shared/logo";

const sidebarIcons: Record<string, LucideIcon> = {
  "Pesanan Saya": Package,
  Layanan: LayoutGrid,
  "Tambah Saldo": Wallet,
  Referral: Users,
  Tiket: LifeBuoy,
  Pembaruan: Bell,
  Syarat: FileText,
  API: Code2,
};

const secondaryIcons: Record<string, LucideIcon> = {
  Pengaturan: Settings,
  Status: Activity,
};

const toneClasses: Record<string, { icon: string; strip: string }> = {
  sky: {
    icon: "bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300",
    strip: "bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300",
    strip: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  rose: {
    icon: "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300",
    strip: "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300",
  },
};

const statIcons = [Wallet2, ListOrdered, CreditCard];

export function DashboardPreview() {
  const data = dashboardPreviewData;

  return (
    <div className="flex overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-2xl shadow-primary-200/40 dark:border-slate-800 dark:bg-slate-900">
      <aside className="w-60 shrink-0 border-r border-primary-100 bg-primary-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/40">
          <div className="mb-5 flex items-center justify-between px-1">
            <Logo size="sm" />
            <span className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 dark:text-slate-500">
              <ChevronLeft className="h-3.5 w-3.5" />
            </span>
          </div>

          <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-primary-100 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-[11px] font-bold text-white">
              {data.accountSwitcher.initials}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] text-slate-400">Akun Saya</p>
              <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                {data.accountSwitcher.name}
              </p>
            </div>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-300" />
          </div>

          <nav className="space-y-0.5">
            <div className="flex items-center gap-2.5 rounded-xl bg-primary-solid px-3 py-2 text-xs font-semibold text-white shadow-sm">
              <ShoppingCart className="h-3.5 w-3.5" />
              {data.sidebarActive}
            </div>
            {data.sidebarItems.map((label) => {
              const Icon = sidebarIcons[label];
              return (
                <div
                  key={label}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </div>
              );
            })}
            <div className="my-2 border-t border-primary-100 dark:border-slate-800" />
            {data.sidebarSecondary.map((label) => {
              const Icon = secondaryIcons[label];
              return (
                <div
                  key={label}
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400"
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </div>
              );
            })}
          </nav>

          <p className="mt-6 px-3 text-[10px] text-slate-300 dark:text-slate-600">
            {data.versionLabel}
          </p>
        </aside>

        <div className="w-[880px] shrink-0 p-7">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                {data.breadcrumb.map((crumb, i) => (
                  <span
                    key={crumb}
                    className={
                      i === data.breadcrumb.length - 1
                        ? "font-semibold text-primary-500"
                        : ""
                    }
                  >
                    {crumb}
                    {i < data.breadcrumb.length - 1 ? (
                      <span className="mx-1.5 text-slate-300">/</span>
                    ) : null}
                  </span>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {data.breadcrumbSubtext}
              </p>
            </div>
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-primary-100 text-slate-400 dark:border-slate-700">
              <Moon className="h-3.5 w-3.5" />
            </span>
          </div>

          <h2 className="mt-6 text-xl font-extrabold text-slate-900 dark:text-white">
            {data.welcomeTitle} <span aria-hidden>👋</span>
          </h2>
          <p className="mt-1.5 max-w-md text-xs text-slate-400">
            {data.welcomeSubtitle}
          </p>

          <div className="mt-6 grid grid-cols-3 gap-4">
            {data.stats.map((stat, i) => {
              const Icon = statIcons[i];
              const tone = toneClasses[stat.tone];
              return (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-primary-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span
                    className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone.icon}`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <p className="mt-3 text-[11px] text-slate-400">
                    {stat.label}
                  </p>
                  <p className="text-base font-bold text-slate-900 dark:text-white">
                    {stat.value}
                  </p>
                  <div
                    className={`mt-3 flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${tone.strip}`}
                  >
                    {stat.actionLabel}
                    <ChevronDown className="h-3 w-3 -rotate-90" />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-5 gap-5">
            <div className="col-span-3 rounded-2xl border border-primary-100 p-5 dark:border-slate-800">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-solid text-white">
                  <ShoppingCart className="h-3.5 w-3.5" />
                </span>
                {data.orderCard.title}
              </div>

              <div className="mt-4 flex gap-1 rounded-lg bg-primary-50/70 p-1 dark:bg-slate-800/60">
                {data.orderCard.tabs.map((tab, i) => (
                  <span
                    key={tab}
                    className={`flex-1 rounded-md px-2 py-1.5 text-center text-[11px] font-semibold ${
                      i === 0
                        ? "bg-white text-primary-600 shadow-sm dark:bg-slate-900"
                        : "text-slate-400"
                    }`}
                  >
                    {tab}
                  </span>
                ))}
              </div>

              <div className="mt-4 space-y-3">
                <MockField
                  label={data.orderCard.categoryLabel}
                  value={data.orderCard.categoryPlaceholder}
                  icon={<SiInstagram className="h-3.5 w-3.5 text-primary-500" />}
                  dropdown
                />
                <MockField
                  label={data.orderCard.serviceLabel}
                  value={data.orderCard.servicePlaceholder}
                  dropdown
                />
                <MockField
                  label={data.orderCard.linkLabel}
                  value={data.orderCard.linkPlaceholder}
                  muted
                />
                <MockField
                  label={data.orderCard.quantityLabel}
                  value={data.orderCard.quantityPlaceholder}
                  muted
                />
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div className="flex-1 rounded-xl border border-primary-100 px-3 py-2.5 text-xs dark:border-slate-700">
                  <span className="text-slate-400">
                    {data.orderCard.subtotalLabel}
                  </span>
                  <span className="ml-1.5 font-bold text-slate-800 dark:text-slate-100">
                    {data.orderCard.subtotalValue}
                  </span>
                </div>
                <button
                  type="button"
                  tabIndex={-1}
                  className="rounded-xl bg-primary-solid px-5 py-2.5 text-xs font-semibold text-white shadow-sm shadow-primary-500/30"
                >
                  {data.orderCard.submitLabel}
                </button>
              </div>
            </div>

            <div className="col-span-2 rounded-2xl border border-primary-100 bg-primary-50/40 p-5 dark:border-slate-800 dark:bg-slate-950/30">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-slate-900">
                <SiInstagram className="h-4 w-4 text-primary-500" />
              </span>
              <p className="mt-3 text-xs font-bold leading-snug text-slate-900 dark:text-white">
                {data.infoCard.title}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                {data.infoCard.productId}
              </p>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-primary-100 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                  <Clock3 className="h-3.5 w-3.5 text-primary-500" />
                  <p className="mt-1 text-[9px] text-slate-400">
                    {data.infoCard.completionTimeLabel}
                  </p>
                  <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    {data.infoCard.completionTimeValue}
                  </p>
                </div>
                <div className="rounded-xl border border-primary-100 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary-500" />
                  <p className="mt-1 text-[9px] text-slate-400">
                    {data.infoCard.trustedLabel}
                  </p>
                  <p className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
                    {data.infoCard.trustedValue}
                  </p>
                </div>
              </div>

              <p className="mt-4 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {data.infoCard.howToTitle}
              </p>
              <ul className="mt-2 space-y-1.5">
                {data.infoCard.howToSteps.map((step) => (
                  <li
                    key={step}
                    className="flex gap-1.5 text-[10px] leading-snug text-slate-500 dark:text-slate-400"
                  >
                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary-400" />
                    {step}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
  );
}

function MockField({
  label,
  value,
  icon,
  dropdown,
  muted,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  dropdown?: boolean;
  muted?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-xl border border-primary-100 bg-white px-3 py-2.5 text-xs dark:border-slate-700 dark:bg-slate-900">
        {icon}
        <span
          className={`flex-1 truncate ${
            muted
              ? "text-slate-300 dark:text-slate-600"
              : "text-slate-600 dark:text-slate-300"
          }`}
        >
          {value}
        </span>
        {dropdown ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        ) : null}
      </div>
    </div>
  );
}

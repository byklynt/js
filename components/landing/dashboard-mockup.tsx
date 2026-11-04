import {
  LayoutGrid,
  ShoppingBag,
  Wallet,
  Settings,
  Users,
  LifeBuoy,
  Wand2,
  Wallet2,
  ListOrdered,
  Clock3,
  ChevronDown,
} from "lucide-react";
import { dashboardMock } from "@/lib/landing-data";
import { Reveal } from "./reveal";

const sidebarItems = [
  { icon: LayoutGrid, label: "Dashboard", active: true },
  { icon: ShoppingBag, label: "Pesanan Saya" },
  { icon: Wallet, label: "Saldo" },
  { icon: Users, label: "Reseller" },
  { icon: LifeBuoy, label: "Bantuan" },
  { icon: Settings, label: "Pengaturan" },
];

const statCards = [
  { icon: Wallet2, label: dashboardMock.balance.label, value: dashboardMock.balance.value, tone: "sky" },
  { icon: ListOrdered, label: dashboardMock.totalOrders.label, value: dashboardMock.totalOrders.value, tone: "emerald" },
  { icon: Wallet2, label: dashboardMock.spent.label, value: dashboardMock.spent.value, tone: "rose" },
  { icon: Clock3, label: dashboardMock.pending.label, value: dashboardMock.pending.value, tone: "amber" },
];

const toneClasses: Record<string, string> = {
  sky: "bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300",
  emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-300",
  rose: "bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-300",
  amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300",
};

export function DashboardMockup() {
  return (
    <section className="px-4 py-10">
      <Reveal className="mx-auto max-w-6xl">
        <div className="overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-xl shadow-primary-100/70 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
          <div className="flex">
            <aside className="hidden w-56 shrink-0 border-r border-primary-100 bg-primary-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/40 md:block">
              <div className="mb-6 flex items-center gap-2 px-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-solid text-white">
                  <Wand2 className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm font-extrabold text-slate-900 dark:text-white">
                  JagoanSosmed
                </span>
              </div>
              <nav className="space-y-1">
                {sidebarItems.map((item) => (
                  <div
                    key={item.label}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium ${
                      item.active
                        ? "bg-primary-solid text-white shadow-sm"
                        : "text-slate-500 hover:bg-primary-100/60 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </div>
                ))}
              </nav>
            </aside>

            <div className="flex-1 p-5 sm:p-7">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {dashboardMock.greeting} <span aria-hidden>👋</span>
              </h3>

              <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {statCards.map((card) => (
                  <div
                    key={card.label}
                    className="rounded-2xl border border-primary-100 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${toneClasses[card.tone]}`}
                    >
                      <card.icon className="h-4 w-4" />
                    </span>
                    <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">
                      {card.value}
                    </p>
                    <p className="text-[11px] text-slate-400">{card.label}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-5 lg:grid-cols-5">
                <div className="rounded-2xl border border-primary-100 p-5 dark:border-slate-800 lg:col-span-3">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    Buat Pesanan Baru
                  </p>
                  <div className="mt-4 space-y-3">
                    <Field label="Kategori" value={dashboardMock.form.category} dropdown />
                    <Field label="Layanan" value={dashboardMock.form.service} dropdown />
                    <Field label="Link" value={dashboardMock.form.link} />
                    <Field label="Jumlah" value={dashboardMock.form.quantity} />
                  </div>
                  <button
                    type="button"
                    className="mt-4 w-full rounded-xl bg-primary-solid py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-500/30 transition hover:bg-primary-600"
                  >
                    Pesan Sekarang
                  </button>
                </div>

                <div className="rounded-2xl border border-primary-100 bg-primary-50/50 p-5 dark:border-slate-800 dark:bg-slate-950/30 lg:col-span-2">
                  <p className="text-sm font-bold text-slate-900 dark:text-white">
                    Instagram &ndash; Followers
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Instant &bull; Garansi 30 Hari &bull; Refill Otomatis
                  </p>
                  <ul className="mt-4 space-y-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <li>Waktu selesai: 1&ndash;6 jam</li>
                    <li>Kualitas: Followers aktif terpercaya</li>
                    <li>Bergaransi penuh selama masa aktif</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Field({
  label,
  value,
  dropdown = false,
}: {
  label: string;
  value: string;
  dropdown?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <div className="flex items-center justify-between rounded-xl border border-primary-100 bg-white px-3 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
        <span className="truncate">{value}</span>
        {dropdown ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        ) : null}
      </div>
    </div>
  );
}

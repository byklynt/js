import {
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  Headset,
  LayoutDashboard,
  LayoutGrid,
  ScrollText,
  Server,
  ShoppingCart,
  Users,
  Wallet,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { Logo } from "@/components/shared/logo";

const navItems: { label: string; icon: LucideIcon }[] = [
  { label: "Pengguna", icon: Users },
  { label: "Pesanan", icon: ClipboardCheck },
  { label: "Layanan", icon: LayoutGrid },
  { label: "Provider", icon: Server },
  { label: "Deposit", icon: WalletCards },
  { label: "Tiket", icon: Headset },
  { label: "Log Aktivitas", icon: ScrollText },
];

const stats: { label: string; value: string; icon: LucideIcon; tone: string }[] = [
  { label: "Pendapatan Hari Ini", value: "Rp 4.820.000", icon: Wallet, tone: "sky" },
  { label: "Pesanan Hari Ini", value: "1.284", icon: ShoppingCart, tone: "amber" },
  { label: "Pengguna Baru", value: "63", icon: Users, tone: "emerald" },
  { label: "Tiket Menunggu", value: "9", icon: Headset, tone: "rose" },
];

const toneClasses: Record<string, { icon: string; strip: string }> = {
  sky: {
    icon: "bg-primary-50 text-primary-600 dark:bg-primary-950/60 dark:text-primary-300",
    strip: "bg-primary-50 text-primary-600 dark:bg-primary-950/40 dark:text-primary-300",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300",
    strip: "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300",
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

const recent = [
  { id: "7112481", name: "TikTok Views + 10% Like", user: "budi_santoso", status: "Berjalan", tone: "sky" },
  { id: "7112480", name: "Instagram Followers Indonesia", user: "siti_aisyah", status: "Selesai", tone: "emerald" },
  { id: "7112479", name: "YouTube Views Retensi Tinggi", user: "andi_pratama", status: "Menunggu", tone: "amber" },
  { id: "7112478", name: "Telegram Post Views", user: "rina_wulandari", status: "Selesai", tone: "emerald" },
];

const chartPoints = [38, 52, 44, 66, 58, 82, 74, 96, 88, 112, 104, 128];

function RevenueChart() {
  const w = 560;
  const h = 150;
  const max = 140;
  const step = w / (chartPoints.length - 1);
  const pts = chartPoints.map((v, i) => [i * step, h - (v / max) * h] as const);
  const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-[150px] w-full" role="img" aria-label="Grafik pendapatan contoh">
      <defs>
        <linearGradient id="adm-prev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" className="text-primary" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" className="text-primary" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((r) => (
        <line key={r} x1="0" x2={w} y1={h * r} y2={h * r} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" />
      ))}
      <path d={area} fill="url(#adm-prev-fill)" />
      <path d={line} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {pts.slice(-1).map(([x, y]) => (
        <circle key="end" cx={x} cy={y} r="4" fill="#fff" className="stroke-primary" strokeWidth="2.5" />
      ))}
    </svg>
  );
}

/** Static HTML/Tailwind mockup of the admin dashboard (no real data) for the login page. */
export function AdminPreview() {
  return (
    <div className="flex overflow-hidden rounded-3xl border border-primary-100 bg-white shadow-2xl shadow-primary-200/40 dark:border-slate-800 dark:bg-slate-900">
      <aside className="w-60 shrink-0 border-r border-primary-100 bg-primary-50/40 p-4 dark:border-slate-800 dark:bg-slate-950/40">
        <div className="mb-5 flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <Logo size="sm" />
            <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[9px] font-bold text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
              Admin
            </span>
          </div>
          <span className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 dark:text-slate-500">
            <ChevronLeft className="h-3.5 w-3.5" />
          </span>
        </div>

        <div className="mb-4 flex items-center gap-2.5 rounded-xl border border-primary-100 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-400 to-primary-600 text-[11px] font-bold text-white">
            A
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] text-slate-400">Admin</p>
            <p className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">admin</p>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        </div>

        <nav className="space-y-0.5">
          <div className="flex items-center gap-2.5 rounded-xl bg-primary-solid px-3 py-2 text-xs font-semibold text-white shadow-sm">
            <LayoutDashboard className="h-3.5 w-3.5" />
            Dasbor
          </div>
          {navItems.map(({ label, icon: Icon }) => (
            <div
              key={label}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </div>
          ))}
        </nav>
      </aside>

      <div className="w-[880px] shrink-0 p-7">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <span>Beranda</span>
          <span className="text-slate-300">/</span>
          <span>Admin</span>
          <span className="text-slate-300">/</span>
          <span className="font-semibold text-primary-500">Dasbor</span>
        </div>
        <h3 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          Ringkasan hari ini
        </h3>

        <div className="mt-5 grid grid-cols-4 gap-3">
          {stats.map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="rounded-2xl border border-primary-100 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClasses[tone].icon}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[10px] text-slate-400">{label}</p>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{value}</p>
                </div>
              </div>
              <div className={`mt-3 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold ${toneClasses[tone].strip}`}>Lihat detail</div>
            </div>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-[1.4fr_1fr] gap-3">
          <div className="rounded-2xl border border-primary-100 p-4 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Pendapatan 30 hari</p>
            <RevenueChart />
          </div>
          <div className="rounded-2xl border border-primary-100 p-4 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Pesanan Terbaru</p>
            <ul className="mt-3 space-y-2.5">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">{o.name}</p>
                    <p className="text-[10px] text-slate-400">
                      #{o.id} - {o.user}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${toneClasses[o.tone].strip}`}>
                    {o.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

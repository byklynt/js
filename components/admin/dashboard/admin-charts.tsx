"use client";

import { useTheme } from "next-themes";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatIdr } from "@/lib/balance";
import { useIsMounted } from "@/lib/use-is-mounted";

type ChartTooltipProps = {
  active?: boolean;
  payload?: { value?: number; name?: string; color?: string }[];
  label?: string | number;
  money?: boolean;
  unit: string;
};

export function ChartTooltip({ active, payload, label, money, unit }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">{label}</p>
      {payload.map((p, i) => {
        const value = p.value ?? 0;
        return (
          <p key={i} className="mt-0.5 text-[11px] font-semibold text-ink dark:text-white">
            {payload.length > 1 && p.name ? <span className="font-medium text-[#5B6B8C] dark:text-slate-400">{p.name}: </span> : null}
            {money ? formatIdr(value) : `${value.toLocaleString("id-ID")} ${unit}`}
          </p>
        );
      })}
    </div>
  );
}

export function useChartColors() {
  const { resolvedTheme } = useTheme();
  const mounted = useIsMounted();
  const dark = mounted && resolvedTheme === "dark";
  return {
    mounted,
    line: "var(--primary)", // brand token: follows light/dark by itself
    profit: dark ? "#34d399" : "#10b981",
    grid: dark ? "#2a2d30" : "#e2e8f0",
    axis: dark ? "#8fa1b5" : "#5B6B8C",
    cursor: "var(--primary-soft)",
  };
}

export const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });

export function RevenueChart({ data }: { data: { label: string; value: number; profit: number }[] }) {
  const c = useChartColors();
  if (!c.mounted) return <div className="animate-shimmer h-[240px] rounded-xl" />;
  return (
    <div role="img" aria-label="Grafik pendapatan dan profit" className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="adm-revenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.line} stopOpacity={0.28} />
              <stop offset="100%" stopColor={c.line} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip content={<ChartTooltip money unit="" />} cursor={{ stroke: c.line, strokeOpacity: 0.3 }} />
          <Area type="monotone" dataKey="value" name="Pendapatan" stroke={c.line} strokeWidth={2.5} fill="url(#adm-revenue)" dot={false} activeDot={{ r: 4, fill: "#fff", stroke: c.line, strokeWidth: 2.5 }} />
          <Area type="monotone" dataKey="profit" name="Profit" stroke={c.profit} strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} activeDot={{ r: 4, fill: "#fff", stroke: c.profit, strokeWidth: 2.5 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function PlatformChart({ data }: { data: { platform: string; value: number }[] }) {
  const c = useChartColors();
  if (!c.mounted) return <div className="animate-shimmer h-[240px] rounded-xl" />;
  return (
    <div role="img" aria-label="Grafik pesanan per platform" className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="platform" tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: c.axis }} tickLine={false} axisLine={false} width={36} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip content={<ChartTooltip unit="pesanan" />} cursor={{ fill: c.cursor }} />
          <Bar dataKey="value" fill={c.line} radius={[8, 8, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

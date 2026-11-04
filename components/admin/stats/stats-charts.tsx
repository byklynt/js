"use client";

import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip, compact, useChartColors } from "@/components/admin/dashboard/admin-charts";
import { EmptyState } from "@/components/ui/empty-state";

export type Series = { key: string; label: string; color?: "primary" | "profit" | "refund" | "amber" | "slate" };

const H = "h-[240px] w-full";

function Skeleton() {
  return <div aria-busy="true" className="animate-shimmer h-[240px] rounded-xl" />;
}

/** Shared frame: skeleton while loading, empty state without data. */
function Frame({ loading, empty, label, children }: { loading: boolean; empty: boolean; label: string; children: React.ReactNode }) {
  const c = useChartColors();
  if (loading || !c.mounted) return <Skeleton />;
  if (empty) return <div className="flex h-[240px] items-center justify-center"><EmptyState icon={BarChart3} title="Belum ada data untuk filter ini" /></div>;
  return (
    <div role="img" aria-label={label} className={H}>
      {children}
    </div>
  );
}

function useColors() {
  const c = useChartColors();
  const dark = c.axis === "#8fa1b5";
  return {
    ...c,
    palette: {
      primary: c.line,
      profit: c.profit,
      refund: dark ? "#f87171" : "#ef4444",
      amber: dark ? "#fbbf24" : "#f59e0b",
      slate: dark ? "#94a3b8" : "#64748b",
    },
    // Stacked bars: brand tints from strong to light, then slate.
    stack: [c.line, "var(--primary-400)", "var(--primary-700)", "#94a3b8"],
  };
}

const axisProps = (axis: string) => ({ tick: { fontSize: 10, fill: axis }, tickLine: false, axisLine: false });

export function SeriesLine({
  data, series, money = false, unit = "", loading, label,
}: { data: Record<string, number | string>[]; series: Series[]; money?: boolean; unit?: string; loading: boolean; label: string }) {
  const c = useColors();
  const empty = data.length === 0 || data.every((d) => series.every((s) => !Number(d[s.key])));
  return (
    <Frame loading={loading} empty={empty} label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axisProps(c.axis)} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps(c.axis)} width={money ? 44 : 36} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip content={<ChartTooltip money={money} unit={unit} />} cursor={{ stroke: c.line, strokeOpacity: 0.3 }} />
          {series.map((s, i) => (
            <Line
              key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={c.palette[s.color ?? "primary"]} strokeWidth={i === 0 ? 2.5 : 2}
              strokeDasharray={i > 0 && s.color === "refund" ? "5 4" : undefined} dot={false}
              activeDot={{ r: 4, fill: "#fff", stroke: c.palette[s.color ?? "primary"], strokeWidth: 2.5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Frame>
  );
}

export function StackedBars({
  data, keys, money = true, loading, label,
}: { data: Record<string, number | string>[]; keys: string[]; money?: boolean; loading: boolean; label: string }) {
  const c = useColors();
  const empty = data.length === 0 || data.every((d) => keys.every((k) => !Number(d[k])));
  return (
    <Frame loading={loading} empty={empty} label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" {...axisProps(c.axis)} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps(c.axis)} width={44} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip content={<ChartTooltip money={money} unit="" />} cursor={{ fill: c.cursor }} />
          {keys.map((k, i) => (
            <Bar key={k} dataKey={k} name={k} stackId="a" fill={c.stack[i % c.stack.length]} radius={i === keys.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={28} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/** Columns: one value per category. */
export function ColumnBars({
  data, dataKey, xKey, unit, money = false, loading, label,
}: { data: Record<string, number | string>[]; dataKey: string; xKey: string; unit: string; money?: boolean; loading: boolean; label: string }) {
  const c = useColors();
  const empty = data.length === 0 || data.every((d) => !Number(d[dataKey]));
  return (
    <Frame loading={loading} empty={empty} label={label}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={xKey} {...axisProps(c.axis)} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...axisProps(c.axis)} width={36} tickFormatter={(v: number) => compact.format(v)} />
          <Tooltip content={<ChartTooltip money={money} unit={unit} />} cursor={{ fill: c.cursor }} />
          <Bar dataKey={dataKey} name={unit} fill={c.line} radius={[8, 8, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </Frame>
  );
}

/** Horizontal bars for rankings (top 10). */
export function HorizontalBars({
  data, money = true, unit = "", loading, label, height = 300,
}: { data: { name: string; value: number }[]; money?: boolean; unit?: string; loading: boolean; label: string; height?: number }) {
  const c = useColors();
  const empty = data.length === 0 || data.every((d) => !d.value);
  if (loading || !c.mounted) return <div aria-busy="true" className="animate-shimmer rounded-xl" style={{ height }} />;
  if (empty) return <div className="flex items-center justify-center" style={{ height: 240 }}><EmptyState icon={BarChart3} title="Belum ada data untuk filter ini" /></div>;
  return (
    <div role="img" aria-label={label} className="w-full" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" {...axisProps(c.axis)} tickFormatter={(v: number) => compact.format(v)} />
          <YAxis type="category" dataKey="name" {...axisProps(c.axis)} width={110} />
          <Tooltip content={<ChartTooltip money={money} unit={unit} />} cursor={{ fill: c.cursor }} />
          <Bar dataKey="value" name={unit || "Nilai"} fill={c.line} radius={[0, 8, 8, 0]} maxBarSize={20} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

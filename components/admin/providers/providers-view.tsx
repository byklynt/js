"use client";

import { useState } from "react";
import { Plug, Power, RefreshCw, Server, SlidersHorizontal } from "lucide-react";
import type { PublicProvider } from "@/lib/admin-data";
import { refreshProviderBalanceAction, savePricingSettings, setProviderStatus, testProviderConnection } from "@/lib/admin-actions";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { LOW_PROVIDER_BALANCE } from "@/lib/admin-data";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { EmptyState } from "@/components/ui/empty-state";
import { useAdminRunner } from "../use-admin-runner";
import { LowBalanceChip, ProviderStatusChip } from "../admin-chips";
import { StatusChip } from "@/components/ui/status-chip";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { MarkupType } from "@/lib/admin-data";

/** Shows scheme + host only; the path/query of the API URL stays hidden. */
function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}/••••`;
  } catch {
    return "••••";
  }
}

export type PricingView = {
  currency: string;
  rateIdr: number;
  roundTo: number;
  defaultMarkup: { markupType: MarkupType; markup: number };
  providerMarkup: { markupType: MarkupType; markup: number };
};

const markupItems: { value: MarkupType; label: string }[] = [
  { value: "persen", label: "Persen" },
  { value: "tetap", label: "Tetap (Rp)" },
];

/** Kurs, pembulatan and the markup given to new imported services. */
function PricingModal({ pricing, open, onClose }: { pricing: PricingView; open: boolean; onClose: () => void }) {
  const run = useAdminRunner();
  const [rate, setRate] = useState(String(pricing.rateIdr));
  const [roundTo, setRoundTo] = useState(String(pricing.roundTo));
  const [defType, setDefType] = useState<MarkupType>(pricing.defaultMarkup.markupType);
  const [def, setDef] = useState(String(pricing.defaultMarkup.markup));
  const [provType, setProvType] = useState<MarkupType>(pricing.providerMarkup.markupType);
  const [prov, setProv] = useState(String(pricing.providerMarkup.markup));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const result = await run(
      savePricingSettings({ rateIdr: rate, roundTo, defaultMarkupType: defType, defaultMarkup: def, providerMarkupType: provType, providerMarkup: prov })
    );
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <Dialog open={open} onClose={onClose} title="Kurs dan markup" description={`Harga provider dalam ${pricing.currency} per 1000 dikonversi ke Rupiah. Berlaku saat sinkronisasi berikutnya.`} maxWidth="max-w-md">
      <form noValidate onSubmit={submit} className="space-y-3.5">
        <TextField label={`Kurs 1 ${pricing.currency} ke Rupiah`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} hint="Diisi manual. TODO: ambil kurs otomatis." />
        <TextField label="Pembulatan harga jual (ke atas, Rp)" inputMode="numeric" value={roundTo} onChange={(e) => setRoundTo(e.target.value)} hint="1 = tiap Rupiah, 10 = kelipatan Rp 10." />
        <div>
          <p className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">Markup provider ini (layanan baru)</p>
          <SegmentedControl<MarkupType> items={markupItems} value={provType} onChange={setProvType} ariaLabel="Jenis markup provider" />
          <div className="mt-2"><TextField label={provType === "persen" ? "Markup (%)" : "Markup (Rp per 1000)"} inputMode="decimal" value={prov} onChange={(e) => setProv(e.target.value)} /></div>
        </div>
        <div>
          <p className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">Markup default</p>
          <SegmentedControl<MarkupType> items={markupItems} value={defType} onChange={setDefType} ariaLabel="Jenis markup default" />
          <div className="mt-2"><TextField label={defType === "persen" ? "Markup (%)" : "Markup (Rp per 1000)"} inputMode="decimal" value={def} onChange={(e) => setDef(e.target.value)} /></div>
        </div>
        {error ? <p role="alert" className="text-[9.5px] font-medium text-red-500">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={busy}>Simpan</Button>
        </div>
      </form>
    </Dialog>
  );
}

export function ProvidersView({ providers, mode, modeSource, modeWarning, pricing }: { providers: PublicProvider[]; mode: "mock" | "live" | "off"; modeSource: string; modeWarning: string | null; pricing: PricingView }) {
  const run = useAdminRunner();
  const [testing, setTesting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);

  return (
    <div>
      <PageHeader title="Provider" subtitle="Kelola koneksi ke provider layanan." />

      <p className="mt-6 text-[10px] text-[#5B6B8C] dark:text-slate-400">Provider yang didukung saat ini: Likeo. URL dan API key dibaca dari .env.local.</p>

      {providers.length === 0 ? (
        <div className="mt-5">
          <EmptyState icon={Server} title="Belum ada provider" />
        </div>
      ) : (
        <ul className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map((p) => (
            <li key={p.id} className="list-none rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-soft text-primary-accent">
                    <Server className="h-4 w-4" aria-hidden />
                  </span>
                  <h2 className="text-[12px] font-semibold text-ink dark:text-white">{p.name}</h2>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {p.kind === "likeo" ? <StatusChip label={mode === "mock" ? "MODE MOCK" : mode === "live" ? "MODE LIVE" : "BELUM DIATUR"} tone={mode === "mock" ? "amber" : mode === "live" ? "emerald" : "red"} /> : null}
                  <ProviderStatusChip status={p.status} />
                </div>
              </div>

              <dl className="mt-4 space-y-2.5 text-[10px]">
                {p.kind === "likeo" ? (
                  <div>
                    <dt className="text-[#5B6B8C] dark:text-slate-400">Mode</dt>
                    <dd className="mt-0.5 text-[10.5px] font-medium text-ink dark:text-white">
                      {mode} <span className="font-normal text-[#5B6B8C] dark:text-slate-400">({modeSource})</span>
                    </dd>
                    {modeWarning ? <dd className="mt-0.5 text-[9.5px] text-amber-600 dark:text-amber-300">{modeWarning}</dd> : null}
                  </div>
                ) : null}
                <div>
                  <dt className="text-[#5B6B8C] dark:text-slate-400">URL API</dt>
                  <dd className="mt-0.5 truncate font-mono text-[10.5px] text-ink dark:text-white">{maskUrl(p.apiUrl)}</dd>
                </div>
                <div>
                  <dt className="text-[#5B6B8C] dark:text-slate-400">API key</dt>
                  <dd className="mt-0.5 flex items-center gap-2">
                    <span className="truncate font-mono text-[10.5px] text-ink dark:text-white">{p.apiKeyMasked}</span>
                    <span className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">dari .env.local</span>
                  </dd>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <dt className="text-[#5B6B8C] dark:text-slate-400">Saldo</dt>
                    <dd className="mt-0.5 text-[16px] font-medium text-ink dark:text-white">{formatIdr(p.balance)}</dd>
                    {p.kind === "likeo" && p.balanceNative !== undefined ? (
                      <dd className="mt-0.5 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
                        {p.balanceNative.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {p.currency}
                        {p.balanceAt ? <> &middot; dibaca <time dateTime={p.balanceAt}>{formatDateTime(p.balanceAt)}</time></> : null}
                      </dd>
                    ) : null}
                  </div>
                  {p.balance < LOW_PROVIDER_BALANCE ? <LowBalanceChip /> : null}
                </div>
                <div className="text-[#5B6B8C] dark:text-slate-400">
                  Terakhir sinkron {p.lastSync ? <time dateTime={p.lastSync}>{formatDateTime(p.lastSync)}</time> : "belum pernah"}
                </div>
                {p.kind === "likeo" && p.lastTest ? (
                  <div role="status" className={`break-words ${p.lastTest.ok ? "text-emerald-600 dark:text-emerald-300" : "text-red-500"}`}>
                    {p.lastTest.ok ? "Tes terakhir berhasil" : "Tes terakhir gagal"}: {p.lastTest.message}
                  </div>
                ) : null}
              </dl>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="h-8"
                  loading={testing === p.id}
                  onClick={async () => {
                    setTesting(p.id);
                    await run(testProviderConnection({ id: p.id }));
                    setTesting(null);
                  }}
                >
                  <Plug className="h-3.5 w-3.5" aria-hidden />
                  Tes koneksi
                </Button>
                {p.kind === "likeo" ? (
                  <>
                    <Button
                      variant="outline"
                      className="h-8"
                      loading={refreshing === p.id}
                      onClick={async () => {
                        setRefreshing(p.id);
                        await run(refreshProviderBalanceAction({ id: p.id }));
                        setRefreshing(null);
                      }}
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                      Segarkan
                    </Button>
                    <Button variant="outline" className="h-8" onClick={() => setPricingOpen(true)}>
                      <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
                      Kurs &amp; markup
                    </Button>
                  </>
                ) : null}
                <Button
                  variant="outline"
                  className="h-8"
                  onClick={() => void run(setProviderStatus({ id: p.id, active: p.status !== "aktif" }))}
                >
                  <Power className="h-3.5 w-3.5" aria-hidden />
                  {p.status === "aktif" ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}


      <PricingModal key={pricingOpen ? "pricing-open" : "pricing-closed"} pricing={pricing} open={pricingOpen} onClose={() => setPricingOpen(false)} />

    </div>
  );
}

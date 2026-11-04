"use client";

import { useState } from "react";
import { Eye, EyeOff, Pencil, Plug, Plus, Power, RefreshCw, Server, SlidersHorizontal } from "lucide-react";
import type { PublicProvider } from "@/lib/admin-data";
import { refreshProviderBalanceAction, revealProviderKey, saveProvider, savePricingSettings, setProviderStatus, testProviderConnection } from "@/lib/admin-actions";
import { formatDateTime, formatIdr } from "@/lib/balance";
import { LOW_PROVIDER_BALANCE } from "@/lib/admin-data";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PasswordField, TextField } from "@/components/ui/text-field";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
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

function ProviderModal({
  provider,
  open,
  onClose,
}: {
  provider: PublicProvider | null;
  open: boolean;
  onClose: () => void;
}) {
  const run = useAdminRunner();
  const [name, setName] = useState(provider?.name ?? "");
  const [apiUrl, setApiUrl] = useState(provider?.apiUrl ?? "https://");
  const [apiKey, setApiKey] = useState("");
  const [password, setPassword] = useState("");
  const [active, setActive] = useState(provider ? provider.status === "aktif" : true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    if (apiKey && !password) {
      setBusy(false);
      setError("Masukkan password adminmu untuk mengubah API key.");
      return;
    }
    const result = await run(saveProvider({ id: provider?.id, name, apiUrl, apiKey, active, password }));
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={provider ? `Ubah ${provider.name}` : "Tambah provider"}
      description="API key disimpan di server dan tidak pernah dikirim ke browser."
      maxWidth="max-w-md"
    >
      <form noValidate onSubmit={submit} className="space-y-3.5">
        <TextField label="Nama provider" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="URL API" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.contoh.id/v2" />
        <PasswordField
          label="API key"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          hint={provider ? "Kosongkan untuk mempertahankan key saat ini." : undefined}
        />
        {apiKey ? <PasswordField label="Password admin" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} hint="Wajib saat mengubah API key." /> : null}
        <div className="flex items-center justify-between rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
          <span className="text-[10.5px] font-medium text-ink dark:text-white">Aktif</span>
          <ToggleSwitch checked={active} onChange={setActive} label="Aktif" />
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

export function ProvidersView({ providers, mode, modeSource, modeWarning, pricing }: { providers: PublicProvider[]; mode: "mock" | "live"; modeSource: string; modeWarning: string | null; pricing: PricingView }) {
  const run = useAdminRunner();
  const [editing, setEditing] = useState<{ provider: PublicProvider | null } | null>(null);
  const [revealFor, setRevealFor] = useState<PublicProvider | null>(null);
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [pricingOpen, setPricingOpen] = useState(false);

  return (
    <div>
      <PageHeader title="Provider" subtitle="Kelola koneksi ke provider layanan." />

      <div className="mt-8 flex justify-end">
        <Button onClick={() => setEditing({ provider: null })}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Tambah provider
        </Button>
      </div>

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
                  {p.kind === "likeo" ? <StatusChip label={mode === "mock" ? "MODE MOCK" : "MODE LIVE"} tone={mode === "mock" ? "amber" : "emerald"} /> : null}
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
                    <span className="truncate font-mono text-[10.5px] text-ink dark:text-white">{revealed[p.id] ?? p.apiKeyMasked}</span>
                    {p.kind === "likeo" ? <span className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">dari .env.local</span> : <button
                      type="button"
                      aria-label={revealed[p.id] ? `Sembunyikan API key ${p.name}` : `Tampilkan API key ${p.name}`}
                      onClick={() => {
                        if (revealed[p.id]) setRevealed((r) => { const next = { ...r }; delete next[p.id]; return next; });
                        else setRevealFor(p);
                      }}
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-ink hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-primary dark:text-slate-100 dark:hover:bg-slate-800"
                    >
                      {revealed[p.id] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>}
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
                ) : (
                  <Button variant="outline" className="h-8" onClick={() => setEditing({ provider: p })}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Ubah
                  </Button>
                )}
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

      <ProviderModal
        key={editing ? (editing.provider?.id ?? "new") : "closed"}
        open={Boolean(editing)}
        provider={editing?.provider ?? null}
        onClose={() => setEditing(null)}
      />

      <PricingModal key={pricingOpen ? "pricing-open" : "pricing-closed"} pricing={pricing} open={pricingOpen} onClose={() => setPricingOpen(false)} />

      <ConfirmDialog
        open={Boolean(revealFor)}
        onClose={() => setRevealFor(null)}
        title="Tampilkan API key?"
        description="Demi keamanan hanya awal dan akhir key yang ditampilkan. Masukkan password adminmu."
        confirmLabel="Tampilkan"
        tone="primary"
        requirePassword
        onConfirm={async (password) => {
          if (!revealFor) return;
          const result = await run(revealProviderKey({ id: revealFor.id, password }));
          if (result.ok) {
            setRevealed((r) => ({ ...r, [revealFor.id]: (result.data as { partial: string }).partial }));
            setRevealFor(null);
          }
        }}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { Copy, Plug, RefreshCw, ShieldAlert } from "lucide-react";
import type { SiteSettings } from "@/lib/admin-data";
import { refreshPaymenkuChannels, savePaymenkuSettings, testPaymenkuConnection } from "@/lib/admin-actions";
import { FEE_POLICY_LABEL, type FeePolicy } from "@/lib/server/payments/gateway-rules";
import { SettingsSection } from "@/components/settings/settings-parts";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextField } from "@/components/ui/text-field";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useToast } from "@/components/shared/toast";
import { cn } from "@/lib/utils";
import { useAdminRunner } from "../use-admin-runner";
import { Row } from "./admin-settings-forms";

export type AdminChannel = { code: string; name: string; type: string; feeMode: "merchant" | "customer" | "split"; feeFlat: number; feePercent: number; minAmount: number; maxAmount: number };
export type PaymenkuState = { state: "off" | "sandbox" | "live"; reason: string; webhookUrl: string; channels: AdminChannel[]; channelsError: string };

const feeModeLabel = { merchant: "biaya di merchant (tanpa biaya untuk pengguna)", customer: "biaya ditanggung pengguna", split: "biaya dibagi" } as const;
const rp = (n: number) => `Rp ${n.toLocaleString("id-ID")}`;

/** Paymenku: mode banner, connection test, the on / off switch, largest top-up, fee policy, channels, and the webhook URL to register in the Paymenku dashboard. */
export function PaymenkuSettings({ settings, paymenku }: { settings: SiteSettings["payments"]["gateway"]; paymenku: PaymenkuState }) {
  const run = useAdminRunner();
  const toast = useToast();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [maxDeposit, setMaxDeposit] = useState(String(settings.maxDeposit));
  const [feePolicy, setFeePolicy] = useState<FeePolicy>(settings.feePolicy);
  const [chosen, setChosen] = useState<string[]>(settings.channels);
  const [channels, setChannels] = useState<AdminChannel[]>(paymenku.channels);
  const [busy, setBusy] = useState<"" | "save" | "test" | "channels">("");
  const [error, setError] = useState("");
  const off = paymenku.state === "off";

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Alamat webhook disalin");
    } catch {
      toast("Gagal menyalin", "error");
    }
  }

  return (
    <SettingsSection icon={Plug} title="Payment gateway Paymenku">
      <div className="max-w-[720px] space-y-4" data-testid="paymenku-settings">
        <div
          role="status"
          data-testid="paymenku-mode"
          className={cn(
            "flex items-start gap-2 rounded-2xl px-4 py-3 text-[10.5px] font-semibold",
            paymenku.state === "live" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
            : paymenku.state === "sandbox" ? "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300"
            : "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300",
          )}
        >
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {paymenku.state === "live" ? "MODE LIVE: pembayaran memindahkan uang sungguhan."
              : paymenku.state === "sandbox" ? "MODE SANDBOX: pembayaran uji coba, tidak ada uang yang berpindah. Hanya untuk project DEV."
              : `GATEWAY NONAKTIF: ${paymenku.reason}`}
          </span>
        </div>

        <Row label="Aktifkan Paymenku" hint="Pengguna bisa menambah saldo lewat QRIS, Virtual Account, atau e-wallet. Transfer manual tetap tersedia bila aktif di atas.">
          <ToggleSwitch checked={enabled} disabled={off && !enabled} label="Aktifkan Paymenku" onChange={setEnabled} />
        </Row>

        <TextField label="Maksimal deposit lewat gateway (Rp)" inputMode="numeric" value={maxDeposit} onChange={(e) => setMaxDeposit(e.target.value.replace(/\D/g, ""))} hint="Deposit minimal memakai pengaturan Deposit minimal di atas. Batas masing-masing kanal dari Paymenku tetap berlaku." />

        <div>
          <p className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">Siapa yang menanggung biaya</p>
          <SegmentedControl
            ariaLabel="Kebijakan biaya"
            value={feePolicy}
            onChange={setFeePolicy}
            items={[{ value: "ikuti", label: "Ikuti kanal" }, { value: "pengguna", label: "Pengguna" }, { value: "kami", label: "Kami" }]}
          />
          <p className="mt-1.5 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
            {FEE_POLICY_LABEL[feePolicy]}. Paymenku menetapkan siapa yang menanggung biaya per kanal; pilihan ini menyaring kanal yang ditawarkan. Saldo yang masuk selalu sebesar nominal yang disetujui pengguna.
          </p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[10.5px] font-semibold text-ink dark:text-slate-200">Kanal pembayaran</p>
            <Button
              variant="outline"
              loading={busy === "channels"}
              disabled={off}
              onClick={async () => {
                setBusy("channels");
                const res = await run(refreshPaymenkuChannels());
                setBusy("");
                if (res.ok && Array.isArray(res.data)) setChannels(res.data as AdminChannel[]);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Segarkan kanal
            </Button>
          </div>
          {paymenku.channelsError ? <p className="mb-2 text-[9.5px] font-medium text-red-500">{paymenku.channelsError}</p> : null}
          {channels.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 px-3 py-4 text-center text-[10px] text-slate-500 dark:border-slate-700">
              {off ? "Aktifkan kunci API dulu." : "Belum ada kanal. Tekan Segarkan kanal."}
            </p>
          ) : (
            <ul className="space-y-2">
              {channels.map((c) => (
                <li key={c.code} className="list-none">
                  <Row label={`${c.name} (${c.code})`} hint={`${feeModeLabel[c.feeMode]}; biaya ${rp(c.feeFlat)} + ${c.feePercent}%; batas ${rp(c.minAmount)} - ${rp(c.maxAmount)}`}>
                    <ToggleSwitch checked={chosen.includes(c.code)} label={`Aktifkan kanal ${c.name}`} onChange={(v) => setChosen((all) => (v ? [...new Set([...all, c.code])] : all.filter((x) => x !== c.code)))} />
                  </Row>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <TextField label="Alamat webhook (daftarkan di dashboard Paymenku)" readOnly value={paymenku.webhookUrl} hint="Salin ke Dashboard Paymenku, lalu isi PAYMENKU_WEBHOOK_SECRET di server dengan webhook secret dari dashboard yang sama." />
          <Button variant="outline" className="mt-2" onClick={() => void copy(paymenku.webhookUrl)}>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Salin alamat
          </Button>
        </div>

        {error ? <p role="alert" className="text-[9.5px] font-medium text-red-500">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            loading={busy === "save"}
            onClick={async () => {
              setBusy("save");
              setError("");
              const res = await run(savePaymenkuSettings({ enabled, maxDeposit: Number(maxDeposit), feePolicy, channels: chosen }));
              setBusy("");
              if (!res.ok) setError(res.error);
            }}
          >
            Simpan pengaturan Paymenku
          </Button>
          <Button variant="outline" loading={busy === "test"} disabled={off} onClick={async () => { setBusy("test"); await run(testPaymenkuConnection()); setBusy(""); }}>
            <Plug className="h-3.5 w-3.5" aria-hidden /> Uji koneksi
          </Button>
        </div>
      </div>
    </SettingsSection>
  );
}

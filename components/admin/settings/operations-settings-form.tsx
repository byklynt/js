"use client";

import { useState } from "react";
import { Clock, Database, Gauge, Gavel, ShieldAlert } from "lucide-react";
import type { SiteSettings } from "@/lib/admin-data";
import { saveMonitoringSettings, saveOperationsSettings } from "@/lib/admin-actions";
import { formatDateTime } from "@/lib/balance";
import { SettingsPageHeader, SettingsSection } from "@/components/settings/settings-parts";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { TextField } from "@/components/ui/text-field";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useAdminRunner } from "../use-admin-runner";
import { Row } from "./admin-settings-forms";

type Props = {
  operations: SiteSettings["operations"];
  risk: SiteSettings["risk"];
  pricing: SiteSettings["pricing"];
  limits: SiteSettings["limits"];
  ops: SiteSettings["ops"];
  estimates: SiteSettings["estimates"];
};

const digits = (v: string) => v.replace(/\D/g, "");

export function OperationsSettingsForm({ operations, risk, pricing, limits, ops, estimates }: Props) {
  const run = useAdminRunner();
  const [form, setForm] = useState({
    stuckHours: String(operations.stuckHours),
    lowBalanceThreshold: String(operations.lowBalanceThreshold),
    autoDisableLowBalance: operations.autoDisableLowBalance,
    riskRatioPercent: String(risk.ratioPercent),
    riskMinOrders: String(risk.minOrders),
    minMarginPercent: String(pricing.minMarginPercent),
    autoAdjustPrice: pricing.autoAdjust,
    ordersPerMinute: String(limits.ordersPerMinute),
    ticketsPerHour: String(limits.ticketsPerHour),
    estimateMinSamples: String(estimates.minSamples),
    estimateWindow: String(estimates.window),
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dsn, setDsn] = useState("");
  const [dsnBusy, setDsnBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: k === "minMarginPercent" ? e.target.value.replace(/[^\d.]/g, "") : digits(e.target.value) });

  return (
    <>
      <SettingsPageHeader title="Operasional" subtitle="Batas peringatan, risiko pengguna, margin harga, dan pemantauan sistem." />
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const result = await run(saveOperationsSettings({ ...form }));
          setBusy(false);
          if (!result.ok) setError(result.error);
        }}
      >
        <SettingsSection icon={Gauge} title="Batas peringatan">
          <div className="max-w-[720px] space-y-4">
            <TextField label="Pesanan dianggap macet setelah (jam)" inputMode="numeric" value={form.stuckHours} onChange={set("stuckHours")} hint="Pesanan yang belum selesai lebih lama dari ini muncul di filter Macet." />
            <TextField label="Batas saldo provider rendah (Rp)" inputMode="numeric" value={form.lowBalanceThreshold} onChange={set("lowBalanceThreshold")} />
            <Row label="Nonaktifkan layanan otomatis" hint="Layanan milik provider dengan saldo di bawah batas dinonaktifkan saat sinkronisasi.">
              <ToggleSwitch checked={form.autoDisableLowBalance} label="Nonaktifkan layanan otomatis" onChange={(v) => setForm({ ...form, autoDisableLowBalance: v })} />
            </Row>
          </div>
        </SettingsSection>
        <SettingsSection icon={Gavel} title="Risiko dan batas penggunaan">
          <div className="grid max-w-[720px] gap-4 sm:grid-cols-2">
            <TextField label="Tandai pengguna jika batal + refund lebih dari (%)" inputMode="numeric" value={form.riskRatioPercent} onChange={set("riskRatioPercent")} />
            <TextField label="Minimal jumlah pesanan untuk dinilai" inputMode="numeric" value={form.riskMinOrders} onChange={set("riskMinOrders")} />
            <TextField label="Batas pesanan per menit (per pengguna)" inputMode="numeric" value={form.ordersPerMinute} onChange={set("ordersPerMinute")} />
            <TextField label="Batas tiket per jam (per pengguna)" inputMode="numeric" value={form.ticketsPerHour} onChange={set("ticketsPerHour")} />
          </div>
        </SettingsSection>
        <SettingsSection icon={Clock} title="Estimasi pengerjaan">
          <div className="grid max-w-[720px] gap-4 sm:grid-cols-2">
            <TextField label="Tampilkan estimasi mulai dari (pesanan selesai)" inputMode="numeric" value={form.estimateMinSamples} onChange={set("estimateMinSamples")} hint="Di bawah jumlah ini pengguna melihat Belum ada estimasi." />
            <TextField label="Hitung dari pesanan terakhir (per layanan)" inputMode="numeric" value={form.estimateWindow} onChange={set("estimateWindow")} hint="Memakai median, jadi satu pesanan lambat tidak mengubah angka." />
          </div>
        </SettingsSection>
        <SettingsSection icon={ShieldAlert} title="Keamanan harga">
          <div className="max-w-[720px] space-y-4">
            <TextField label="Margin minimum (%)" inputMode="decimal" value={form.minMarginPercent} onChange={set("minMarginPercent")} hint="Layanan di bawah batas ini ditandai Margin tipis." />
            <Row label="Sesuaikan harga jual otomatis" hint="Saat harga provider naik dan margin turun di bawah minimum, harga jual dinaikkan sampai margin minimum tercapai.">
              <ToggleSwitch checked={form.autoAdjustPrice} label="Sesuaikan harga jual otomatis" onChange={(v) => setForm({ ...form, autoAdjustPrice: v })} />
            </Row>
            {error ? <p role="alert" className="text-[9.5px] font-medium text-red-500">{error}</p> : null}
            <Button type="submit" loading={busy}>Simpan</Button>
          </div>
        </SettingsSection>
      </form>

      <SettingsSection icon={Database} title="Cadangan dan pemantauan error">
        <div className="max-w-[720px] space-y-4">
          <Row label="Cadangan terakhir" hint="Belum tersedia: cadangan butuh database sungguhan. Sementara salin folder .data secara manual.">
            {ops.lastBackupAt ? <span className="text-[10px] font-medium text-ink dark:text-white">{formatDateTime(ops.lastBackupAt)}</span> : <StatusChip label="Belum ada data" tone="slate" />}
          </Row>
          <form
            noValidate
            className="space-y-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setDsnBusy(true);
              const result = await run(saveMonitoringSettings({ monitoringDsn: dsn }));
              setDsnBusy(false);
              if (result.ok) setDsn("");
            }}
          >
            <TextField
              label="DSN pemantauan error"
              type="password"
              autoComplete="off"
              value={dsn}
              onChange={(e) => setDsn(e.target.value)}
              placeholder={ops.monitoringDsn ? "••••••••••••  (tersimpan)" : "https://kunci@o0.ingest.sentry.io/0"}
              hint="Disimpan di server dan tidak pernah dikirim balik ke browser. Belum dipakai: pengiriman error ke layanan pemantauan belum tersedia."
            />
            <Button type="submit" loading={dsnBusy}>Simpan DSN</Button>
          </form>
        </div>
      </SettingsSection>
    </>
  );
}

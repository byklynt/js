"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import type { SiteSettings } from "@/lib/admin-data";
import { saveNotificationSettings } from "@/lib/admin-actions";
import { alertLabels } from "@/lib/server/alert-labels";
import type { AlertKind } from "@/lib/server/types";
import { SettingsPageHeader, SettingsSection } from "@/components/settings/settings-parts";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useAdminRunner } from "../use-admin-runner";
import { Row } from "./admin-settings-forms";

export function NotificationSettingsForm({ settings }: { settings: SiteSettings["notifications"] }) {
  const run = useAdminRunner();
  const [form, setForm] = useState({ ...settings, largeDepositAmount: String(settings.largeDepositAmount) });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <>
      <SettingsPageHeader title="Notifikasi" subtitle="Pilih kabar penting yang dikirim ke tim admin lewat Telegram atau email." />
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const result = await run(saveNotificationSettings(form));
          setBusy(false);
          if (!result.ok) setError(result.error);
        }}
      >
        <SettingsSection icon={Bell} title="Saluran">
          <div className="max-w-[720px] space-y-4">
            <TextField label="Webhook Telegram" value={form.telegramWebhook} onChange={(e) => setForm({ ...form, telegramWebhook: e.target.value })} placeholder="https://api.telegram.org/bot.../sendMessage" hint="Kosongkan untuk menonaktifkan. Pengiriman sungguhan belum tersambung (placeholder)." />
            <TextField label="Webhook email" value={form.emailWebhook} onChange={(e) => setForm({ ...form, emailWebhook: e.target.value })} placeholder="https://email.contoh.id/hook" />
          </div>
        </SettingsSection>
        <SettingsSection icon={Bell} title="Jenis notifikasi">
          <div className="max-w-[720px] space-y-2">
            {(Object.keys(alertLabels) as AlertKind[]).map((kind) => (
              <Row key={kind} label={alertLabels[kind]}>
                <ToggleSwitch checked={form.toggles[kind]} label={alertLabels[kind]} onChange={(v) => setForm({ ...form, toggles: { ...form.toggles, [kind]: v } })} />
              </Row>
            ))}
            <TextField label="Batas deposit besar (Rp)" inputMode="numeric" value={form.largeDepositAmount} onChange={(e) => setForm({ ...form, largeDepositAmount: e.target.value.replace(/\D/g, "") })} hint="Deposit sebesar ini atau lebih memicu notifikasi. Batas saldo provider dan jam macet ada di tab Operasional." error={error || undefined} />
            <Button type="submit" loading={busy}>Simpan</Button>
          </div>
        </SettingsSection>
      </form>
    </>
  );
}

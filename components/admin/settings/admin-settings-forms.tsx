"use client";

import { useState } from "react";
import { Bell, CreditCard, Crown, KeyRound, Link2, Plus, Settings, Gauge, ListChecks, ShieldCheck, Trash2, Wallet } from "lucide-react";
import type { SiteSettings } from "@/lib/admin-data";
import { COMMUNITY_FIELDS } from "@/lib/community-links";
import {
  changeAdminPassword,
  saveCommunityLinks,
  saveGeneralSettings,
  savePaymentSettings,
  saveRankSettings,
} from "@/lib/admin-actions";
import { paymentMethods } from "@/lib/payments-data";
import type { SettingsNavItem } from "@/lib/settings-data";
import { SettingsShell } from "@/components/settings/settings-shell";
import { SettingsPageHeader, SettingsSection } from "@/components/settings/settings-parts";
import { Button } from "@/components/ui/button";
import { PasswordField, TextField } from "@/components/ui/text-field";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useAdminRunner } from "../use-admin-runner";

const adminSettingsNav: SettingsNavItem[] = [
  { href: "/admin/settings", label: "Umum", icon: Settings },
  { href: "/admin/settings/payments", label: "Pembayaran", icon: CreditCard },
  { href: "/admin/settings/ranks", label: "Peringkat dan Harga", icon: Crown },
  { href: "/admin/settings/security", label: "Keamanan", icon: ShieldCheck },
  { href: "/admin/settings/order-rules", label: "Ketentuan Order", icon: ListChecks },
  { href: "/admin/settings/operations", label: "Operasional", icon: Gauge },
  { href: "/admin/settings/notifications", label: "Notifikasi", icon: Bell },
];

export function AdminSettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <SettingsShell nav={adminSettingsNav} badge="Admin" label="Pengaturan situs">
      {children}
    </SettingsShell>
  );
}

export function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200/70 p-3.5 dark:border-slate-800">
      <div>
        <p className="text-[10.5px] font-semibold text-ink dark:text-white">{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function GeneralSettingsForm({ settings }: { settings: SiteSettings["general"] }) {
  const run = useAdminRunner();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);

  return (
    <>
      <SettingsPageHeader title="Pengaturan Umum" subtitle="Identitas situs, kontak, dan mode pemeliharaan." />
      <SettingsSection icon={Settings} title="Situs">
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await run(saveGeneralSettings(form));
            setBusy(false);
          }}
          className="max-w-[720px] space-y-4"
        >
          <TextField label="Nama situs" value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Email support" type="email" value={form.supportEmail} onChange={(e) => setForm({ ...form, supportEmail: e.target.value })} />
            <TextField label="Telegram support" value={form.supportTelegram} onChange={(e) => setForm({ ...form, supportTelegram: e.target.value })} />
          </div>
          <Row label="Mode pemeliharaan" hint="Pengguna melihat halaman pemeliharaan; admin tetap bisa masuk.">
            <ToggleSwitch checked={form.maintenance} onChange={(v) => setForm({ ...form, maintenance: v })} label="Mode pemeliharaan" />
          </Row>
          <Button type="submit" loading={busy}>Simpan</Button>
        </form>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------

/** "Tautan Komunitas": optional links shown in the user sidebar and footers. Validated again on the server. */
export function CommunityLinksForm({ settings }: { settings: SiteSettings["community"] }) {
  const run = useAdminRunner();
  const [form, setForm] = useState(settings);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <SettingsSection icon={Link2} title="Tautan Komunitas">
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const result = await run(saveCommunityLinks(form));
          setBusy(false);
          if (!result.ok) setError(result.error);
        }}
        className="max-w-[720px] space-y-4"
        data-testid="community-links-form"
      >
        {COMMUNITY_FIELDS.map((f) => (
          <TextField
            key={f.key}
            label={f.label}
            type="url"
            inputMode="url"
            autoComplete="off"
            value={form[f.key]}
            onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
            placeholder={f.placeholder}
            hint={f.kind === "whatsapp" ? "Hanya wa.me, whatsapp.com, atau chat.whatsapp.com (https). Kosongkan untuk menonaktifkan." : "Hanya t.me atau telegram.me (https). Kosongkan untuk menonaktifkan."}
          />
        ))}
        {error ? <p role="alert" className="text-[9.5px] font-medium text-red-500" data-testid="community-links-error">{error}</p> : null}
        <Button type="submit" loading={busy}>Simpan tautan</Button>
      </form>
    </SettingsSection>
  );
}

export function PaymentSettingsForm({ settings }: { settings: SiteSettings["payments"] }) {
  const run = useAdminRunner();
  const [active, setActive] = useState(settings.activeMethods);
  const [minDeposit, setMinDeposit] = useState(String(settings.minDeposit));
  const [tiers, setTiers] = useState(settings.bonusTiers.map((t) => ({ min: String(t.min), percent: String(t.percent) })));
  const [busy, setBusy] = useState(false);

  return (
    <>
      <SettingsPageHeader title="Pembayaran" subtitle="Metode aktif, deposit minimal, dan bonus." />
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await run(
            savePaymentSettings({
              activeMethods: active,
              minDeposit: Number(minDeposit),
              bonusTiers: tiers.map((t) => ({ min: Number(t.min), percent: Number(t.percent) })),
            })
          );
          setBusy(false);
        }}
      >
        <SettingsSection icon={Wallet} title="Metode pembayaran">
          <ul className="max-w-[720px] space-y-2">
            {paymentMethods.map((m) => (
              <li key={m.id} className="list-none">
                <Row label={m.name} hint={m.needsGateway ? "Butuh payment gateway: belum tersedia" : m.detail}>
                  <ToggleSwitch
                    disabled={m.needsGateway}
                    checked={active.includes(m.id)}
                    label={`Aktifkan ${m.name}`}
                    onChange={(v) => setActive((a) => (v ? [...a, m.id] : a.filter((x) => x !== m.id)))}
                  />
                </Row>
              </li>
            ))}
          </ul>
        </SettingsSection>
        <SettingsSection icon={CreditCard} title="Deposit minimal">
          <div className="max-w-[320px]">
            <TextField label="Minimal deposit (Rp)" inputMode="numeric" value={minDeposit} onChange={(e) => setMinDeposit(e.target.value)} />
          </div>
        </SettingsSection>
        <SettingsSection icon={Crown} title="Bonus deposit">
          <ul className="max-w-[720px] space-y-2">
            {tiers.map((t, i) => (
              <li key={i} className="flex list-none items-end gap-3">
                <div className="flex-1">
                  <TextField label={`Deposit mulai (Rp) #${i + 1}`} inputMode="numeric" value={t.min} onChange={(e) => setTiers((all) => all.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))} />
                </div>
                <div className="w-28">
                  <TextField label="Bonus (%)" inputMode="decimal" value={t.percent} onChange={(e) => setTiers((all) => all.map((x, j) => (j === i ? { ...x, percent: e.target.value } : x)))} />
                </div>
                <Button variant="outline" aria-label={`Hapus tingkat bonus ${i + 1}`} onClick={() => setTiers((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-2">
            <Button variant="outline" onClick={() => setTiers((all) => [...all, { min: "0", percent: "0" }])}>
              <Plus className="h-3.5 w-3.5" aria-hidden />
              Tambah tingkat
            </Button>
          </div>
        </SettingsSection>
        <div className="border-t border-slate-200/70 px-5 py-6 sm:px-8 dark:border-slate-800">
          <Button type="submit" loading={busy}>Simpan pengaturan pembayaran</Button>
        </div>
      </form>
    </>
  );
}

// ---------------------------------------------------------------------------

export function RankSettingsForm({ settings }: { settings: SiteSettings["ranks"] }) {
  const run = useAdminRunner();
  const [ranks, setRanks] = useState(settings.map((r) => ({ ...r, minSpent: String(r.minSpent), discountPercent: String(r.discountPercent) })));
  const [busy, setBusy] = useState(false);

  return (
    <>
      <SettingsPageHeader title="Peringkat dan Harga" subtitle="Batas belanja dan diskon untuk tiap peringkat." />
      <SettingsSection icon={Crown} title="Peringkat pengguna">
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            await run(saveRankSettings({ ranks: ranks.map((r) => ({ name: r.name, minSpent: Number(r.minSpent), discountPercent: Number(r.discountPercent) })) }));
            setBusy(false);
          }}
          className="max-w-[720px] space-y-3"
        >
          {ranks.map((r, i) => (
            <div key={r.name} className="grid items-end gap-3 rounded-2xl border border-slate-200/70 p-3.5 sm:grid-cols-[100px_1fr_1fr] dark:border-slate-800">
              <p className="pb-2 text-[11px] font-semibold text-ink dark:text-white">{r.name}</p>
              <TextField label="Belanja minimal (Rp)" inputMode="numeric" value={r.minSpent} disabled={r.name === "Reseller"} hint={r.name === "Reseller" ? "Diatur manual per pengguna." : undefined} onChange={(e) => setRanks((all) => all.map((x, j) => (j === i ? { ...x, minSpent: e.target.value } : x)))} />
              <TextField label="Diskon (%)" inputMode="decimal" value={r.discountPercent} onChange={(e) => setRanks((all) => all.map((x, j) => (j === i ? { ...x, discountPercent: e.target.value } : x)))} />
            </div>
          ))}
          <Button type="submit" loading={busy}>Simpan</Button>
        </form>
      </SettingsSection>
    </>
  );
}

// ---------------------------------------------------------------------------

export function ChangePassword() {
  const run = useAdminRunner();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <SettingsSection icon={KeyRound} title="Ganti password">
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const result = await run(changeAdminPassword({ current, next, confirm }));
          setBusy(false);
          if (result.ok) {
            setCurrent("");
            setNext("");
            setConfirm("");
          } else setError(result.error);
        }}
        className="max-w-[720px] space-y-4"
      >
        <PasswordField label="Password saat ini" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        <PasswordField label="Password baru" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} hint="Minimal 10 karakter." />
        <PasswordField label="Konfirmasi password baru" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={error || undefined} />
        <Button type="submit" loading={busy}>Ubah password</Button>
      </form>
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------


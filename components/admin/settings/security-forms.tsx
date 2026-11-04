"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Laptop, ListChecks, ShieldCheck } from "lucide-react";
import { disableTotp } from "@/lib/admin-2fa";
import { revokeAdminSession, revokeOtherAdminSessions, saveIpAllowlist, saveSecuritySettings } from "@/lib/admin-actions";
import { formatDateTime } from "@/lib/balance";
import { SettingsPageHeader, SettingsSection } from "@/components/settings/settings-parts";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusChip } from "@/components/ui/status-chip";
import { Textarea } from "@/components/ui/textarea";
import { PasswordField, TextField } from "@/components/ui/text-field";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useAdminRunner } from "../use-admin-runner";
import { ChangePassword, Row } from "./admin-settings-forms";

export type SessionRow = { id: string; ip: string; userAgent: string; createdAt: string; lastSeenAt: string; current: boolean };

function browserOf(ua: string): string {
  const os = /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "macOS" : /Android/i.test(ua) ? "Android" : /Linux/i.test(ua) ? "Linux" : "Perangkat lain";
  const br = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Peramban";
  return `${os} - ${br}`;
}

export function SecurityPage({
  requireAdmin2fa,
  twoFactorEnabled,
  backupLeft,
  sessions,
  allowlist,
  currentIp,
}: {
  requireAdmin2fa: boolean;
  twoFactorEnabled: boolean;
  backupLeft: number;
  sessions: SessionRow[];
  allowlist: string[];
  currentIp: string;
}) {
  const run = useAdminRunner();
  const router = useRouter();
  const [require2fa, setRequire2fa] = useState(requireAdmin2fa);
  const [offDialog, setOffDialog] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [disableError, setDisableError] = useState("");
  const [ipText, setIpText] = useState(allowlist.join("\n"));
  const [ipPassword, setIpPassword] = useState("");
  const [ipError, setIpError] = useState("");
  const [ipBusy, setIpBusy] = useState(false);

  return (
    <>
      <SettingsPageHeader title="Keamanan" subtitle="Perlindungan akun admin, sesi aktif, dan pembatasan IP." />

      <SettingsSection icon={ShieldCheck} title="Verifikasi dua langkah">
        <div className="max-w-[720px] space-y-3">
          <Row label="Status 2FA akunmu" hint={twoFactorEnabled ? `Aktif. Sisa kode cadangan: ${backupLeft}.` : "Belum aktif. Panel admin terkunci sampai kamu mengaktifkannya."}>
            <div className="flex items-center gap-2">
              <StatusChip label={twoFactorEnabled ? "Aktif" : "Belum aktif"} tone={twoFactorEnabled ? "emerald" : "amber"} />
              {twoFactorEnabled ? <Button variant="outline" className="h-8" onClick={() => setDisableOpen(true)}>Nonaktifkan</Button> : null}
            </div>
          </Row>
          <Row label="Wajibkan 2FA untuk semua admin" hint="Admin tanpa 2FA tidak bisa membuka halaman admin sampai selesai mengaktifkannya.">
            <ToggleSwitch
              checked={require2fa}
              label="Wajibkan 2FA untuk admin"
              onChange={async (v) => {
                if (!v) return setOffDialog(true);
                setRequire2fa(true);
                const result = await run(saveSecuritySettings({ requireAdmin2fa: true }));
                if (!result.ok) setRequire2fa(false);
              }}
            />
          </Row>
        </div>
      </SettingsSection>

      <SettingsSection icon={Globe} title="Sesi aktif">
        <div className="max-w-[720px] space-y-2">
          <ul className="space-y-2">
            {sessions.map((s) => (
              <li key={s.id} className="list-none">
                <Row label={`${browserOf(s.userAgent)}${s.current ? " (sesi ini)" : ""}`} hint={`${s.ip} - masuk ${formatDateTime(s.createdAt)} - aktif ${formatDateTime(s.lastSeenAt)}`}>
                  <div className="flex items-center gap-2">
                    <Laptop className="h-4 w-4 text-[#5B6B8C] dark:text-slate-400" aria-hidden />
                    <Button variant="outline" className="h-8" onClick={() => void run(revokeAdminSession({ id: s.id }))}>
                      Cabut sesi
                    </Button>
                  </div>
                </Row>
              </li>
            ))}
          </ul>
          <Button variant="outline" disabled={sessions.length < 2} onClick={() => void run(revokeOtherAdminSessions())}>
            Cabut semua sesi lain
          </Button>
        </div>
      </SettingsSection>

      <SettingsSection icon={ListChecks} title="Daftar IP yang diizinkan">
        <form
          noValidate
          className="max-w-[720px] space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setIpBusy(true);
            setIpError("");
            const ips = ipText.split(/[\s,]+/).filter(Boolean);
            const result = await run(saveIpAllowlist({ ips, password: ipPassword }));
            setIpBusy(false);
            if (result.ok) setIpPassword("");
            else setIpError(result.error);
          }}
        >
          <Textarea label="Alamat IP (satu per baris)" value={ipText} onChange={(e) => setIpText(e.target.value)} placeholder={"203.0.113.5\n198.51.100.0/24"} hint={`Kosong = pembatasan mati. IP kamu sekarang: ${currentIp}. Daftar harus memuat IP ini supaya kamu tidak terkunci.`} />
          <PasswordField label="Password admin" autoComplete="current-password" value={ipPassword} onChange={(e) => setIpPassword(e.target.value)} error={ipError || undefined} />
          <Button type="submit" loading={ipBusy}>Simpan daftar IP</Button>
        </form>
      </SettingsSection>

      <ChangePassword />

      <ConfirmDialog
        open={disableOpen}
        onClose={() => { setDisableOpen(false); setDisableError(""); setDisableCode(""); }}
        title="Nonaktifkan verifikasi dua langkah?"
        description="Masukkan password adminmu dan kode 6 digit saat ini (atau satu kode cadangan). Setelah itu kamu perlu mengaturnya lagi dari awal."
        confirmLabel="Nonaktifkan"
        requirePassword
        onConfirm={async (password) => {
          setDisableError("");
          const result = await disableTotp({ password, code: disableCode });
          if (result.ok) {
            router.replace("/admin/setup-2fa");
            router.refresh();
          } else {
            setDisableError(result.error);
            void run(Promise.resolve({ ok: false as const, error: result.error }));
          }
        }}
      >
        <TextField label="Kode verifikasi" value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/[^a-z0-9-]/gi, "").slice(0, 9))} autoComplete="one-time-code" error={disableError || undefined} />
      </ConfirmDialog>

      <ConfirmDialog
        open={offDialog}
        onClose={() => setOffDialog(false)}
        title="Matikan kewajiban 2FA?"
        description="Akun admin tanpa 2FA akan bisa membuka panel lagi. Masukkan password adminmu untuk konfirmasi."
        confirmLabel="Matikan"
        requirePassword
        onConfirm={async (password) => {
          const result = await run(saveSecuritySettings({ requireAdmin2fa: false, password }));
          if (result.ok) {
            setRequire2fa(false);
            setOffDialog(false);
          }
        }}
      />
    </>
  );
}


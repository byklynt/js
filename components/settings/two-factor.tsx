"use client";

import { useId, useState } from "react";
import { Copy, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { disable2FA, enable2FA } from "@/lib/dashboard-actions";
import { useToast } from "@/components/shared/toast";
import { Dialog } from "@/components/ui/dialog";
import {
  PasswordField,
  outlineButtonClass,
  primaryButtonClass,
} from "@/components/ui/text-field";
import { cn } from "@/lib/utils";
import { SettingsPageHeader, SettingsSection } from "./settings-parts";

// Dummy values for the mock enrolment. TODO: generate the secret and backup codes server-side.
const SECRET = "JBSW Y3DP EHPK 3PXP";
const BACKUP_CODES = ["4F7K-92QD", "M3ZL-80XA", "T5RB-17HW", "C9NE-64YU", "L2VJ-35KP", "Q8DS-70GF", "H1XA-49BM", "W6TC-23RZ"];

/** Placeholder QR: a deterministic 13x13 pattern, not a real code. */
function QrPlaceholder() {
  const size = 13;
  const cells = Array.from({ length: size * size }, (_, i) => {
    const x = i % size;
    const y = Math.floor(i / size);
    const finder = (x < 4 && y < 4) || (x > size - 5 && y < 4) || (x < 4 && y > size - 5);
    return finder || (x * 7 + y * 13 + x * y) % 3 === 0;
  });
  return (
    <div
      role="img"
      aria-label="Contoh kode QR (placeholder)"
      className="mx-auto grid h-[132px] w-[132px] gap-px rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-600"
      style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
    >
      {cells.map((on, i) => (
        <span key={i} className={cn("rounded-[1px]", on ? "bg-[#0F1B3D]" : "bg-transparent")} />
      ))}
    </div>
  );
}

export function TwoFactor() {
  const toast = useToast();
  const codeId = useId();
  const codeErrorId = useId();
  const [enabled, setEnabled] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setCodeError("Masukkan 6 digit kode dari aplikasi autentikator.");
      return;
    }
    setCodeError("");
    setBusy(true);
    try {
      const result = await enable2FA(code);
      if (result.success) {
        setEnabled(true);
        setEnableOpen(false);
        setCode("");
        toast("2FA berhasil diaktifkan. Simpan kode cadanganmu.");
      } else {
        setCodeError(result.message);
      }
    } catch {
      setCodeError("Gagal memverifikasi kode. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setPasswordError("Password wajib diisi.");
      return;
    }
    setPasswordError("");
    setBusy(true);
    try {
      const result = await disable2FA(password);
      if (result.success) {
        setEnabled(false);
        setDisableOpen(false);
        setPassword("");
        toast("2FA dinonaktifkan");
      } else {
        setPasswordError(result.message);
      }
    } catch {
      setPasswordError("Gagal menonaktifkan 2FA. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(BACKUP_CODES.join("\n"));
      toast("Kode cadangan disalin");
    } catch {
      toast("Gagal menyalin kode", "error");
    }
  }

  return (
    <>
      <SettingsPageHeader
        title="Autentikasi Dua Faktor"
        subtitle="Tambahkan lapisan keamanan ekstra untuk akunmu."
      />

      <SettingsSection icon={KeyRound} title="Status 2FA">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                enabled
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
              )}
            >
              {enabled ? <ShieldCheck className="h-5 w-5" /> : <ShieldOff className="h-5 w-5" />}
            </span>
            <div>
              <p className="text-[11px] font-semibold text-ink dark:text-white">
                {enabled ? "2FA aktif" : "2FA belum aktif"}
              </p>
              <p className="mt-0.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">
                {enabled
                  ? "Akunmu dilindungi dengan kode dari aplikasi autentikator."
                  : "Aktifkan 2FA agar akunmu lebih aman dari akses tanpa izin."}
              </p>
            </div>
          </div>
          {enabled ? (
            <button type="button" onClick={() => setDisableOpen(true)} className={outlineButtonClass}>
              Nonaktifkan
            </button>
          ) : (
            <button type="button" onClick={() => setEnableOpen(true)} className={cn(primaryButtonClass, "h-9 w-auto px-5")}>
              Aktifkan 2FA
            </button>
          )}
        </div>
      </SettingsSection>

      {enabled ? (
        <SettingsSection icon={KeyRound} title="Kode cadangan">
          <p className="mb-3 text-[10px] text-[#5B6B8C] dark:text-slate-400">
            Simpan kode ini di tempat aman. Setiap kode hanya bisa dipakai satu kali jika kamu kehilangan akses ke autentikator.
          </p>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BACKUP_CODES.map((c) => (
              <li
                key={c}
                className="rounded-xl bg-[#F1F6FB] px-3 py-2 text-center font-mono text-[10.5px] font-medium text-ink dark:bg-[#161b20] dark:text-white"
              >
                {c}
              </li>
            ))}
          </ul>
          <button type="button" onClick={copyCodes} className={cn(outlineButtonClass, "mt-3")}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Salin semua kode
          </button>
        </SettingsSection>
      ) : null}

      <Dialog
        open={enableOpen}
        onClose={() => setEnableOpen(false)}
        title="Aktifkan 2FA"
        description="Pindai kode QR dengan aplikasi autentikator, lalu masukkan 6 digit kode yang muncul."
      >
        <form noValidate onSubmit={handleVerify}>
          <QrPlaceholder />
          <p className="mt-3 text-center text-[10px] text-[#5B6B8C] dark:text-slate-400">
            Atau masukkan kunci ini manual:
          </p>
          <p className="mt-1 text-center font-mono text-[11px] font-medium text-ink dark:text-white">{SECRET}</p>

          <label htmlFor={codeId} className="mt-4 mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
            Kode 6 digit
          </label>
          <input
            id={codeId}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            placeholder="000000"
            aria-invalid={Boolean(codeError)}
            aria-describedby={codeError ? codeErrorId : undefined}
            className={cn(
              "h-[42px] w-full rounded-xl border bg-white text-center font-mono text-[16px] tracking-[0.5em] text-ink outline-none transition placeholder:text-slate-300 focus:border-primary focus:ring-2 focus:ring-primary dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-700",
              codeError ? "border-red-300 dark:border-red-900" : "border-slate-200 dark:border-slate-700"
            )}
          />
          {codeError ? (
            <p id={codeErrorId} className="mt-1.5 text-[9.5px] font-medium text-red-500">
              {codeError}
            </p>
          ) : null}
          <button type="submit" disabled={busy} className={cn(primaryButtonClass, "mt-4")}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Verifikasi
          </button>
        </form>
      </Dialog>

      <Dialog
        open={disableOpen}
        onClose={() => setDisableOpen(false)}
        title="Nonaktifkan 2FA"
        description="Masukkan passwordmu untuk mengonfirmasi. Akunmu akan lebih rentan tanpa 2FA."
      >
        <form noValidate onSubmit={handleDisable} className="space-y-4">
          <PasswordField
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
          />
          <button type="submit" disabled={busy} className={primaryButtonClass}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Nonaktifkan 2FA
          </button>
        </form>
      </Dialog>
    </>
  );
}

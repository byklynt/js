"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Copy, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { beginTotpSetup, confirmTotpSetup } from "@/lib/admin-2fa";
import { TextInput } from "@/components/auth/text-input";
import { FormAlert, type AlertState } from "@/components/shared/form-alert";
import { AuthShell } from "@/components/auth/auth-shell";
import { ToastProvider } from "@/components/shared/toast";
import { AdminPreview } from "./admin-preview";

const submitClass =
  "relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-400 to-primary-600 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 ring-1 ring-white/40 ring-inset transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-80";

/** Forced 2FA enrolment: QR + manual key, confirm with a code, then show the one-time backup codes. */
function SetupForm() {
  const router = useRouter();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [alert, setAlert] = useState<AlertState>(null);
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [backup, setBackup] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void beginTotpSetup().then((r) => (r.ok ? setSetup({ secret: r.secret, qr: r.qr }) : setAlert({ type: "error", message: r.error })));
  }, []);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return setError("Masukkan 6 digit kode.");
    setError(undefined);
    setBusy(true);
    const r = await confirmTotpSetup({ code });
    setBusy(false);
    if (r.ok) setBackup(r.backupCodes);
    else setAlert({ type: "error", message: r.error });
  }

  if (backup) {
    return (
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Simpan kode cadangan</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Kode ini hanya tampil sekali. Tiap kode bisa dipakai satu kali jika ponselmu hilang.</p>
        <ul aria-label="Kode cadangan" className="mt-5 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
          {backup.map((c) => (
            <li key={c} className="list-none">{c}</li>
          ))}
        </ul>
        <button type="button" onClick={() => void navigator.clipboard.writeText(backup.join("\n")).catch(() => {})} className="mt-3 flex items-center gap-2 text-xs font-semibold text-primary-600 dark:text-primary-300">
          <Copy className="h-3.5 w-3.5" aria-hidden /> Salin semua
        </button>
        <label className="mt-5 flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4" />
          Saya sudah menyimpan kode cadangan
        </label>
        <button type="button" disabled={!saved} onClick={() => { router.replace("/admin"); router.refresh(); }} className={`${submitClass} mt-4`}>
          Lanjut ke dasbor
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Aktifkan verifikasi dua langkah</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Akun admin wajib memakai 2FA. Pindai kode QR dengan aplikasi autentikator, lalu masukkan kode 6 digit.</p>
      <form noValidate onSubmit={confirm} className="mt-6 space-y-4">
        <FormAlert state={alert} />
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
          {setup ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={setup.qr} alt="Kode QR untuk aplikasi autentikator" width={192} height={192} className="rounded-lg bg-white p-1" />
          ) : (
            <div className="flex h-48 w-48 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" aria-label="Memuat kode QR" /></div>
          )}
          {setup ? (
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Atau masukkan kunci manual:
              <code data-testid="totp-secret" className="mt-1 block font-mono text-[11px] break-all text-slate-900 dark:text-white">{setup.secret}</code>
            </p>
          ) : null}
        </div>
        <TextInput label="Kode 6 digit" value={code} onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))} placeholder="000000" error={error} autoComplete="one-time-code" icon={KeyRound} />
        <button type="submit" disabled={busy || !setup} className={submitClass}>
          {busy ? (<><Loader2 className="h-4 w-4 animate-spin" /> Memverifikasi...</>) : (<><ShieldCheck className="h-4 w-4" /> Aktifkan</>)}
        </button>
      </form>
    </div>
  );
}

export function TotpSetupScreen() {
  return (
    <ToastProvider>
      <AuthShell
        logoTag="Admin"
        preview={<AdminPreview />}
      >
        <SetupForm />
      </AuthShell>
    </ToastProvider>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, LogIn, User } from "lucide-react";
import { adminLogin, adminVerify2fa } from "@/lib/admin-auth";
import { TextInput } from "@/components/auth/text-input";
import { PasswordInput } from "@/components/auth/password-input";
import { FormAlert, type AlertState } from "@/components/shared/form-alert";
import { useToast } from "@/components/shared/toast";

const submitClass =
  "relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-400 to-primary-600 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 ring-1 ring-white/40 ring-inset transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-80";

/** Admin sign-in: credentials, then an optional 6-digit 2FA step. No signup, Google, or remember-me. */
export function AdminLoginForm({ startAtCode = false }: { startAtCode?: boolean } = {}) {
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<"credentials" | "2fa">(startAtCode ? "2fa" : "credentials");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<{ identifier?: string; password?: string; code?: string }>({});
  const [alert, setAlert] = useState<AlertState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [backupWarning, setBackupWarning] = useState<string | null>(null);

  function finish() {
    setAlert({ type: "success", message: "Berhasil masuk! Mengalihkan ke dasbor admin..." });
    toast("Berhasil masuk");
    router.replace("/admin");
    router.refresh();
  }

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    const next: typeof errors = {};
    if (!identifier.trim()) next.identifier = "Username atau email wajib diisi.";
    if (!password) next.password = "Password wajib diisi.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setSubmitting(true);
    try {
      const result = await adminLogin({ identifier, password });
      if (result.status === "ok") finish();
      else if (result.status === "needs_2fa") setStep("2fa");
      else {
        setAlert({ type: "error", message: result.message });
        toast(result.message, "error");
      }
    } catch {
      setAlert({ type: "error", message: "Terjadi kesalahan. Coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCode(e: FormEvent, confirmBackup = false) {
    e.preventDefault();
    setAlert(null);
    if (!/^(\d{6}|[a-z0-9]{4}-[a-z0-9]{4})$/i.test(code)) {
      setErrors({ code: "Masukkan 6 digit kode atau kode cadangan." });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const result = await adminVerify2fa({ code, confirmBackup });
      if (result.status === "confirm_backup") setBackupWarning(result.message);
      else if (result.status === "ok" && result.message) {
        // A backup code was used: 2FA is switched off and the session ended. Back to the password step with the explanation.
        setBackupWarning(null);
        setCode("");
        setPassword("");
        setStep("credentials");
        setAlert({ type: "success", message: result.message });
      } else if (result.status === "ok") finish();
      else if (result.status === "error") {
        setAlert({ type: "error", message: result.message });
        toast(result.message, "error");
      }
    } catch {
      setAlert({ type: "error", message: "Terjadi kesalahan. Coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Masuk Admin</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Khusus pengelola JagoanSosmed.</p>

      {step === "credentials" ? (
        <form noValidate onSubmit={handleCredentials} className="mt-7 space-y-4">
          <FormAlert state={alert} />
          <TextInput
            label="Username atau email"
            value={identifier}
            onChange={setIdentifier}
            placeholder="nama_admin"
            error={errors.identifier}
            autoComplete="username"
            icon={User}
          />
          <PasswordInput
            label="Password"
            value={password}
            onChange={setPassword}
            placeholder="Password admin"
            error={errors.password}
            autoComplete="current-password"
          />
          <button type="submit" disabled={submitting} className={submitClass}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memproses...
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                Masuk
              </>
            )}
          </button>
        </form>
      ) : (
        <form noValidate onSubmit={handleCode} className="mt-7 space-y-4">
          <FormAlert state={alert} />
          {backupWarning ? (
            <div role="alertdialog" aria-labelledby="backup-title" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
              <p id="backup-title" className="font-bold">Pakai kode cadangan?</p>
              <p>{backupWarning}</p>
              <div className="flex gap-2">
                <button type="button" disabled={submitting} onClick={(e) => handleCode(e as unknown as FormEvent, true)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
                  Ya, nonaktifkan 2FA dan masuk
                </button>
                <button type="button" onClick={() => { setBackupWarning(null); setCode(""); }} className="rounded-lg border border-amber-400 px-3 py-2 text-xs font-semibold hover:bg-amber-100 dark:hover:bg-amber-500/20">
                  Batal
                </button>
              </div>
            </div>
          ) : null}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Akun ini memakai verifikasi dua langkah. Masukkan 6 digit kode dari aplikasi autentikator, atau, jika tidak bisa membuka aplikasinya, satu kode cadangan (xxxx-xxxx; memakainya menonaktifkan 2FA dan kamu harus mengaturnya ulang). Setiap kode hanya berlaku sekali: jika baru saja memakainya, tunggu kode berikutnya (sekitar 30 detik).
          </p>
          <TextInput
            label="Kode verifikasi"
            value={code}
            onChange={(v) => setCode(v.replace(/[^a-z0-9-]/gi, "").slice(0, 9))}
            placeholder="000000"
            error={errors.code}
            autoComplete="one-time-code"
            icon={KeyRound}
          />
          <button type="submit" disabled={submitting} className={submitClass}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Memverifikasi...
              </>
            ) : (
              "Verifikasi"
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setStep("credentials");
              setCode("");
              setAlert(null);
            }}
            className="w-full text-center text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300"
          >
            Kembali ke langkah sebelumnya
          </button>
        </form>
      )}
    </div>
  );
}

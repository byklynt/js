"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { updatePassword } from "@/lib/auth-actions";
import { FormAlert, type AlertState } from "@/components/shared/form-alert";
import { PasswordInput } from "./password-input";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string>();
  const [alert, setAlert] = useState<AlertState>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (password.length < 8) return setError("Password minimal 8 karakter.");
    if (password !== confirm) return setError("Konfirmasi password tidak sama.");
    setError(undefined);
    setSubmitting(true);
    try {
      const r = await updatePassword(password);
      if (r.success) {
        setAlert({ type: "success", message: "Password diperbarui. Mengalihkan..." });
        router.push("/dashboard");
      } else setAlert({ type: "error", message: r.message });
    } catch {
      setAlert({ type: "error", message: "Terjadi kesalahan. Coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Atur password baru</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Pilih password baru untuk akunmu (minimal 8 karakter).</p>
      <form noValidate onSubmit={handleSubmit} className="mt-7 space-y-4">
        <FormAlert state={alert} />
        <PasswordInput label="Password baru" value={password} onChange={setPassword} placeholder="Minimal 8 karakter" error={error} autoComplete="new-password" />
        <PasswordInput label="Ulangi password" value={confirm} onChange={setConfirm} placeholder="Ulangi password baru" autoComplete="new-password" />
        <button type="submit" disabled={submitting} className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-400 to-primary-600 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 ring-1 ring-white/40 ring-inset transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-80">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Menyimpan...</> : "Simpan password"}
        </button>
      </form>
    </div>
  );
}

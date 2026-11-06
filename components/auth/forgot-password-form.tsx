"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Mail } from "lucide-react";
import { requestPasswordReset } from "@/lib/auth-actions";
import { FormAlert, type AlertState } from "@/components/shared/form-alert";
import { TextInput } from "./text-input";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [alert, setAlert] = useState<AlertState>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) return setError("Format email tidak valid.");
    setError(undefined);
    setSubmitting(true);
    try {
      const r = await requestPasswordReset(email);
      setAlert({ type: r.success ? "success" : "error", message: r.message ?? "Terjadi kesalahan. Coba lagi." });
    } catch {
      setAlert({ type: "error", message: "Terjadi kesalahan. Coba lagi." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Lupa password?</h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Masukkan email akunmu. Kami kirim link untuk mengatur ulang password.</p>
      <form noValidate onSubmit={handleSubmit} className="mt-7 space-y-4">
        <FormAlert state={alert} />
        <TextInput label="Email" value={email} onChange={setEmail} placeholder="nama@email.com" error={error} type="email" autoComplete="email" icon={Mail} />
        <button type="submit" disabled={submitting} className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-400 to-primary-600 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 ring-1 ring-white/40 ring-inset transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-80">
          {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Mengirim...</> : "Kirim link"}
        </button>
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          <Link href="/login" className="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300">Kembali ke halaman masuk</Link>
        </p>
      </form>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Loader2, Lock, Mail } from "lucide-react";
import { changeEmail, changePassword } from "@/lib/dashboard-actions";
import { useDashboardUser } from "@/components/shell/user-context";
import { useToast } from "@/components/shared/toast";
import { PasswordField, TextField, primaryButtonClass } from "@/components/ui/text-field";
import { SettingsPageHeader, SettingsSection } from "./settings-parts";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function PasswordSection() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const errors = {
    current: !current ? "Password saat ini wajib diisi." : "",
    next: !next
      ? "Password baru wajib diisi."
      : next.length < 8
        ? "Password baru minimal 8 karakter."
        : next === current
          ? "Password baru harus berbeda dari password saat ini."
          : "",
    confirm: !confirm ? "Konfirmasi password wajib diisi." : confirm !== next ? "Konfirmasi password tidak cocok." : "",
  };
  const hasError = Object.values(errors).some(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (hasError) return;
    setSubmitting(true);
    try {
      const result = await changePassword({ currentPassword: current, newPassword: next });
      if (result.success) {
        toast("Password berhasil diubah");
        setCurrent("");
        setNext("");
        setConfirm("");
        setSubmitted(false);
      } else {
        toast(result.message, "error");
      }
    } catch {
      toast("Gagal mengubah password. Coba lagi.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SettingsSection icon={Lock} title="Ubah password">
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          label="Password saat ini"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={submitted ? errors.current : ""}
        />
        <PasswordField
          label="Password baru"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={submitted ? errors.next : ""}
          hint="Minimal 8 karakter."
        />
        <PasswordField
          label="Konfirmasi password baru"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={submitted ? errors.confirm : ""}
        />
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Ubah password
        </button>
      </form>
    </SettingsSection>
  );
}

function EmailSection() {
  const toast = useToast();
  const { email } = useDashboardUser();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const errors = {
    email: !newEmail
      ? "Email baru wajib diisi."
      : !emailPattern.test(newEmail)
        ? "Format email tidak valid."
        : newEmail.toLowerCase() === email.toLowerCase()
          ? "Email baru harus berbeda dari email saat ini."
          : "",
    password: !password ? "Password saat ini wajib diisi." : "",
  };
  const hasError = Object.values(errors).some(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (hasError) return;
    setSubmitting(true);
    try {
      const result = await changeEmail({ newEmail, password });
      if (result.success) {
        toast("Permintaan ubah email dikirim. Cek kotak masukmu untuk konfirmasi.");
        setNewEmail("");
        setPassword("");
        setSubmitted(false);
      } else {
        toast(result.message, "error");
      }
    } catch {
      toast("Gagal mengubah email. Coba lagi.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SettingsSection icon={Mail} title="Ubah email">
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <TextField label="Email saat ini" type="email" value={email} readOnly />
        <TextField
          label="Email baru"
          type="email"
          autoComplete="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          error={submitted ? errors.email : ""}
        />
        <PasswordField
          label="Password saat ini"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={submitted ? errors.password : ""}
        />
        <button type="submit" disabled={submitting} className={primaryButtonClass}>
          {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Ubah email
        </button>
      </form>
    </SettingsSection>
  );
}

export function SecurityForm() {
  return (
    <>
      <SettingsPageHeader title="Pengaturan Keamanan" subtitle="Perbarui pengaturan keamanan akunmu." />
      <PasswordSection />
      <EmailSection />
    </>
  );
}

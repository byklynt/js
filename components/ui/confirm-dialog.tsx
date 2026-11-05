"use client";

import { useState } from "react";
import { Dialog } from "./dialog";
import { Button } from "./button";
import { PasswordField, TextField } from "./text-field";

/**
 * Confirmation for destructive or money-related actions.
 * - `requireText`: user must type this exact word (e.g. "BLOKIR") to enable the confirm button.
 * - `requirePassword`: user re-enters their password (placeholder; verified server-side by the action).
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
  tone = "danger",
  requireText,
  requirePassword,
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  requireText?: string;
  requirePassword?: boolean;
  /** Return false when the server rejected the form: the typed text, password and children stay as they are. */
  onConfirm: (password: string) => Promise<void | boolean> | void | boolean;
  children?: React.ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const textOk = !requireText || typed.trim() === requireText;
  const passwordOk = !requirePassword || password.length > 0;

  function reset() {
    setTyped("");
    setPassword("");
    setError("");
  }

  function close() {
    reset();
    onClose();
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    if (!textOk || !passwordOk) {
      setError(!textOk ? `Ketik ${requireText} untuk melanjutkan.` : "Password wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      const keep = (await onConfirm(password)) === false;
      if (!keep) reset();
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} title={title} description={description} maxWidth="max-w-sm">
      <form noValidate onSubmit={handleConfirm} className="space-y-4">
        {children}
        {requireText ? (
          <TextField
            label={`Ketik ${requireText} untuk konfirmasi`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            error={error && !textOk ? error : undefined}
          />
        ) : null}
        {requirePassword ? (
          <PasswordField
            label="Password admin"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={error && !passwordOk ? error : undefined}
          />
        ) : null}
        {error && textOk && passwordOk ? (
          <p role="alert" className="text-[9.5px] font-medium text-red-500">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={close}>
            Batal
          </Button>
          <Button
            type="submit"
            variant={tone === "danger" ? "danger" : "primary"}
            loading={busy}
            disabled={!textOk || !passwordOk}
          >
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

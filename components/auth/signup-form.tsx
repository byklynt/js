"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserPlus, Loader2, User, Mail } from "lucide-react";
import { authCopy, fieldLabels, fieldPlaceholders, validationMessages } from "@/lib/auth-data";
import { register, loginWithGoogle } from "@/lib/auth-actions";
import { TextInput } from "./text-input";
import { PasswordInput } from "./password-input";
import { GoogleButton } from "./google-button";
import { features } from "@/lib/features";
import { LEGAL_PATHS } from "@/lib/legal-content";
import { FormAlert, type AlertState } from "@/components/shared/form-alert";

type Errors = {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignupForm() {
  const router = useRouter();
  const copy = authCopy.signup;

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [alert, setAlert] = useState<AlertState>(null);

  function validate(): boolean {
    const next: Errors = {};

    if (!username.trim()) {
      next.username = validationMessages.usernameRequired;
    } else if (username.trim().length < 3) {
      next.username = validationMessages.usernameMin;
    }

    if (!email.trim()) {
      next.email = validationMessages.emailRequired;
    } else if (!EMAIL_PATTERN.test(email.trim())) {
      next.email = validationMessages.emailInvalid;
    }

    if (!password) {
      next.password = validationMessages.passwordRequired;
    } else if (password.length < 8) {
      next.password = validationMessages.passwordMin;
    }

    if (!confirmPassword) {
      next.confirmPassword = validationMessages.confirmPasswordRequired;
    } else if (confirmPassword !== password) {
      next.confirmPassword = validationMessages.confirmPasswordMismatch;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setAlert(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await register({ username, email, password });
      if (result.success) {
        setAlert({ type: "success", message: result.message ?? copy.successMessage });
        if (!result.message) router.push("/dashboard");
      } else {
        setAlert({ type: "error", message: result.message });
      }
    } catch {
      setAlert({ type: "error", message: copy.genericError });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogle() {
    setAlert(null);
    setGoogleSubmitting(true);
    try {
      const result = await loginWithGoogle();
      if (result.success) {
        setAlert({ type: "success", message: copy.successMessage });
        router.push("/dashboard");
      } else {
        setAlert({ type: "error", message: result.message });
      }
    } catch {
      setAlert({ type: "error", message: copy.genericError });
    } finally {
      setGoogleSubmitting(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
        {copy.heading}
      </h1>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {copy.subtextPrefix}{" "}
        <Link
          href={copy.subtextHref}
          className="font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300"
        >
          {copy.subtextLinkLabel}
        </Link>
      </p>

      <form noValidate onSubmit={handleSubmit} className="mt-7 space-y-4">
        <FormAlert state={alert} />

        <TextInput
          label={fieldLabels.username}
          value={username}
          onChange={setUsername}
          placeholder={fieldPlaceholders.username}
          error={errors.username}
          autoComplete="username"
          icon={User}
        />

        <TextInput
          label={fieldLabels.email}
          value={email}
          onChange={setEmail}
          placeholder={fieldPlaceholders.email}
          error={errors.email}
          type="email"
          autoComplete="email"
          icon={Mail}
        />

        <PasswordInput
          label={fieldLabels.password}
          value={password}
          onChange={setPassword}
          placeholder={fieldPlaceholders.password}
          error={errors.password}
          autoComplete="new-password"
        />

        <PasswordInput
          label={fieldLabels.confirmPassword}
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder={fieldPlaceholders.confirmPassword}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        <button
          type="submit"
          disabled={submitting}
          className="relative flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-primary-400 to-primary-600 py-3 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 ring-1 ring-white/40 ring-inset transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-80"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {copy.submitLoadingLabel}
            </>
          ) : (
            <>
              <UserPlus className="h-4 w-4" />
              {copy.submitLabel}
            </>
          )}
        </button>

        {/* Implied acceptance (no checkbox). The accepted version and time are stored on the profile by register(). */}
        <p className="text-center text-[11px] leading-relaxed text-slate-500 dark:text-slate-400" data-testid="signup-consent">
          Dengan mendaftar, kamu menyetujui <Link href={LEGAL_PATHS.terms} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-accent underline underline-offset-2">Syarat & Ketentuan</Link>, <Link href={LEGAL_PATHS.refund} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-accent underline underline-offset-2">Kebijakan Refund</Link>, dan <Link href={LEGAL_PATHS.privacy} target="_blank" rel="noopener noreferrer" className="font-medium text-primary-accent underline underline-offset-2">Kebijakan Privasi</Link> kami.
        </p>
      </form>

      {features.googleLogin ? (
      <div className="mt-6 flex justify-center">
        <GoogleButton
          label={copy.googleLabel}
          onClick={handleGoogle}
          disabled={googleSubmitting}
        />
      </div>
      ) : null}
    </div>
  );
}

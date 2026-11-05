"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, User } from "lucide-react";
import { authCopy, fieldLabels, fieldPlaceholders, validationMessages } from "@/lib/auth-data";
import { login, loginWithGoogle } from "@/lib/auth-actions";
import { TextInput } from "./text-input";
import { PasswordInput } from "./password-input";
import { GoogleButton } from "./google-button";
import { features } from "@/lib/features";
import { FormAlert, type AlertState } from "@/components/shared/form-alert";

type Errors = { username?: string; password?: string };

export function LoginForm() {
  const router = useRouter();
  const copy = authCopy.login;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
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

    if (!password) {
      next.password = validationMessages.passwordRequired;
    } else if (password.length < 8) {
      next.password = validationMessages.passwordMin;
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
      const result = await login({ username, password, rememberMe });
      if (result.success) {
        setAlert({ type: "success", message: copy.successMessage });
        router.push("/dashboard");
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

        <div>
          <PasswordInput
            label={fieldLabels.password}
            value={password}
            onChange={setPassword}
            placeholder={fieldPlaceholders.password}
            error={errors.password}
            autoComplete="current-password"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary-500 focus:ring-primary-300 dark:border-slate-600"
          />
          {copy.rememberMeLabel}
        </label>
        <div className="-mt-1 text-right">
          <Link href="/forgot-password" className="text-sm font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-300">
            {copy.forgotPasswordLabel}
          </Link>
        </div>

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
              <LogIn className="h-4 w-4" />
              {copy.submitLabel}
            </>
          )}
        </button>
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

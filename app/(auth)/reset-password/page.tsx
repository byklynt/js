import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { getCurrentUser } from "@/lib/auth-actions";

export const metadata: Metadata = { title: "Atur Password Baru - JagoanSosmed", robots: { index: false, follow: false } };

export default function ResetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={null}>
        <Gate />
      </Suspense>
    </AuthShell>
  );
}

// The recovery link signs the user in (see /auth/callback); without that session there is nothing to reset.
async function Gate() {
  if (!(await getCurrentUser())) redirect("/login?error=link");
  return <ResetPasswordForm />;
}

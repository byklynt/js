"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { ToastProvider } from "@/components/shared/toast";
import { AdminLoginForm } from "./admin-login-form";
import { AdminPreview } from "./admin-preview";

export function AdminLoginScreen() {
  return (
    <ToastProvider>
      <AuthShell
        logoTag="Admin"
        preview={<AdminPreview />}
      >
        <AdminLoginForm />
      </AuthShell>
    </ToastProvider>
  );
}

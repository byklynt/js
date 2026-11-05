"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { ToastProvider } from "@/components/shared/toast";
import { AdminLoginForm } from "./admin-login-form";
import { AdminPreview } from "./admin-preview";

export function AdminLoginScreen({ startAtCode = false }: { startAtCode?: boolean } = {}) {
  return (
    <ToastProvider>
      <AuthShell
        logoTag="Admin"
        preview={<AdminPreview />}
      >
        <AdminLoginForm startAtCode={startAtCode} />
      </AuthShell>
    </ToastProvider>
  );
}

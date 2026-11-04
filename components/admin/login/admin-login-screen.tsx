"use client";

import { AuthShell } from "@/components/auth/auth-shell";
import { FloatingCards } from "@/components/auth/floating-cards";
import { ToastProvider } from "@/components/shared/toast";
import { AdminLoginForm } from "./admin-login-form";
import { AdminPreview } from "./admin-preview";

export function AdminLoginScreen() {
  return (
    <ToastProvider>
      <AuthShell
        logoTag="Admin"
        preview={<AdminPreview />}
        floating={
          <FloatingCards
            followerCard={{ name: "Pesanan", text: "Pesanan baru masuk" }}
            storeCard={{
              label: "Pendapatan Hari Ini",
              metricLabel: "Total deposit berhasil",
              value: "Rp 4.820.000",
              growth: "+12%",
            }}
          />
        }
      >
        <AdminLoginForm />
      </AuthShell>
    </ToastProvider>
  );
}

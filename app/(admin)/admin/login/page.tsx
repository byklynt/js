import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminLoginScreen } from "@/components/admin/login/admin-login-screen";
import { getSession } from "@/lib/auth-server";

export const metadata: Metadata = {
  title: "Masuk Admin - JagoanSosmed",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<AdminLoginScreen />}>
      <AlreadySignedIn />
    </Suspense>
  );
}

// Defence in depth next to proxy.ts: an admin who is already signed in skips the login page.
async function AlreadySignedIn() {
  const session = await getSession();
  if (session?.role === "admin") redirect("/admin");
  return <AdminLoginScreen />;
}

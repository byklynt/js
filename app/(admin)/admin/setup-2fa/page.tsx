import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TotpSetupScreen } from "@/components/admin/login/totp-setup";
import { requireAdmin } from "@/lib/auth-server";
import { getDb } from "@/lib/admin-db";

export const metadata: Metadata = {
  title: "Aktifkan 2FA - Admin JagoanSosmed",
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const admin = await requireAdmin("page", { skipGate: true });
  if (getDb().adminSecurity[admin.sub]?.enabled) redirect("/admin");
  return <TotpSetupScreen />;
}

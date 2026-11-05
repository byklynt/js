import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { TotpSetupScreen } from "@/components/admin/login/totp-setup";
import { loadIdentity, requireAdmin } from "@/lib/auth-server";

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
  void admin;
  if ((await loadIdentity())?.mfaEnrolled) redirect("/admin");
  return <TotpSetupScreen />;
}

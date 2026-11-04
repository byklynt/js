"use client";

import { ShieldOff } from "lucide-react";
import { SettingsPageHeader, SettingsSection } from "./settings-parts";

/** Two-step verification for regular users is not built yet (it exists for admins). Honest notice instead of a fake setup. */
export function TwoFactor() {
  return (
    <>
      <SettingsPageHeader title="Verifikasi Dua Langkah" subtitle="Lapisan keamanan tambahan untuk akunmu." />
      <SettingsSection icon={ShieldOff} title="Belum tersedia">
        <p role="status" className="max-w-[520px] rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[10.5px] text-[#5B6B8C] dark:border-slate-700 dark:text-slate-400">
          Verifikasi dua langkah untuk akun pengguna belum tersedia. Sementara itu gunakan password yang kuat dan unik.
        </p>
      </SettingsSection>
    </>
  );
}

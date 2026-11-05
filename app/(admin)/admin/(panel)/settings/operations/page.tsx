import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { OperationsSettingsForm } from "@/components/admin/settings/operations-settings-form";
import { loadSettings } from "@/lib/server/repo/settings";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        const { operations, risk, pricing, limits, ops } = (await loadSettings());
        // The monitoring DSN is a secret: only whether it is set goes to the browser.
        return <OperationsSettingsForm operations={operations} risk={risk} pricing={pricing} limits={limits} ops={{ lastBackupAt: ops.lastBackupAt, monitoringDsn: ops.monitoringDsn ? "set" : "" }} />;
      }}
    </AdminData>
  );
}

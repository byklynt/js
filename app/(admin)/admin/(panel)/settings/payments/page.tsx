import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { PaymentSettingsForm } from "@/components/admin/settings/admin-settings-forms";
import { PaymenkuSettings, type AdminChannel, type PaymenkuState } from "@/components/admin/settings/paymenku-settings";
import { siteUrl } from "@/lib/site-url";
import { listChannels } from "@/lib/server/payments/deposits-gateway";
import { paymenkuMode } from "@/lib/server/payments/paymenku";
import { loadSettings } from "@/lib/server/repo/settings";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        const settings = await loadSettings();
        const mode = paymenkuMode();
        let channels: AdminChannel[] = [];
        let channelsError = "";
        if (mode.state !== "off") {
          try {
            channels = (await listChannels()).map((c) => ({ code: c.code, name: c.name, type: c.type, feeMode: c.feeMode, feeFlat: c.feeFlat, feePercent: c.feePercent, minAmount: c.minAmount, maxAmount: c.maxAmount }));
          } catch {
            channelsError = "Daftar kanal belum bisa diambil dari Paymenku. Tekan Segarkan kanal.";
          }
        }
        const paymenku: PaymenkuState = { state: mode.state, reason: mode.state === "off" ? mode.reason : "", webhookUrl: `${await siteUrl()}/api/webhooks/paymenku`, channels, channelsError };
        return (
          <PaymentSettingsForm settings={settings.payments}>
            <PaymenkuSettings settings={settings.payments.gateway} paymenku={paymenku} />
          </PaymentSettingsForm>
        );
      }}
    </AdminData>
  );
}

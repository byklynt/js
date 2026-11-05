import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { NotificationSettingsForm } from "@/components/admin/settings/notification-settings-form";
import { loadSettings } from "@/lib/server/repo/settings";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <NotificationSettingsForm settings={(await loadSettings()).notifications} />}</AdminData>;
}

import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { NotificationSettingsForm } from "@/components/admin/settings/notification-settings-form";
import { getDb } from "@/lib/admin-db";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{() => <NotificationSettingsForm settings={getDb().settings.notifications} />}</AdminData>;
}

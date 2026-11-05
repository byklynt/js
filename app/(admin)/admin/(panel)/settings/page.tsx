import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { GeneralSettingsForm } from "@/components/admin/settings/admin-settings-forms";
import { loadSettings } from "@/lib/server/repo/settings";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{async () => <GeneralSettingsForm settings={(await loadSettings()).general} />}</AdminData>;
}

import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { GeneralSettingsForm } from "@/components/admin/settings/admin-settings-forms";
import { getDb } from "@/lib/admin-db";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return <AdminData>{() => <GeneralSettingsForm settings={getDb().settings.general} />}</AdminData>;
}

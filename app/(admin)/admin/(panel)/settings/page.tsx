import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { CommunityLinksForm, GeneralSettingsForm } from "@/components/admin/settings/admin-settings-forms";
import { loadSettings } from "@/lib/server/repo/settings";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        const settings = await loadSettings();
        return (
          <>
            <GeneralSettingsForm settings={settings.general} />
            <CommunityLinksForm settings={settings.community} />
          </>
        );
      }}
    </AdminData>
  );
}

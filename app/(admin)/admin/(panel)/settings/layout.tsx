import { AdminSettingsShell } from "@/components/admin/settings/admin-settings-forms";

export default function AdminSettingsLayout({ children }: { children: React.ReactNode }) {
  return <AdminSettingsShell>{children}</AdminSettingsShell>;
}

import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { SecurityPage } from "@/components/admin/settings/security-forms";
import { loadSettings } from "@/lib/server/repo/settings";
import { getClientIp, loadIdentity, requireAdmin } from "@/lib/auth-server";
import { backupCodesLeft } from "@/lib/server/backup-codes";
import { listAdminSessions } from "@/lib/server/admin-sessions";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        const admin = await requireAdmin();
        const settings = await loadSettings();
        const who = await loadIdentity();
        const sessions = (await listAdminSessions(admin.sub))
          .filter((s) => !s.revokedAt)
          .map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === admin.sid }));
        return (
          <SecurityPage
            requireAdmin2fa={settings.security.requireAdmin2fa}
            twoFactorEnabled={Boolean(who?.mfaEnrolled)}
            backupLeft={await backupCodesLeft(admin.sub)}
            sessions={sessions}
            allowlist={settings.security.ipAllowlist}
            currentIp={await getClientIp()}
          />
        );
      }}
    </AdminData>
  );
}

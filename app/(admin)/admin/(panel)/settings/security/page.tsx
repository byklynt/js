import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { SecurityPage } from "@/components/admin/settings/security-forms";
import { getDb } from "@/lib/admin-db";
import { getClientIp, requireAdmin } from "@/lib/auth-server";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        const admin = await requireAdmin();
        const db = getDb();
        const security = db.adminSecurity[admin.sub];
        const sessions = db.sessions
          .filter((s) => s.adminId === admin.sub && !s.revokedAt)
          .map((s) => ({ id: s.id, ip: s.ip, userAgent: s.userAgent, createdAt: s.createdAt, lastSeenAt: s.lastSeenAt, current: s.id === admin.sid }));
        return (
          <SecurityPage
            requireAdmin2fa={db.settings.security.requireAdmin2fa}
            twoFactorEnabled={Boolean(security?.enabled)}
            backupLeft={security?.backupHashes.length ?? 0}
            sessions={sessions}
            allowlist={db.settings.security.ipAllowlist}
            currentIp={await getClientIp()}
          />
        );
      }}
    </AdminData>
  );
}

import type { AdminDb } from "@/lib/admin-data";

/**
 * Records a system event on an AdminDb value. Only the catalogue sync (a pure function over a throw-away db, see
 * lib/server/repo/services-repo.ts) uses it; the caller writes db.auditLogs to the audit_logs table afterwards.
 */
export function logSystem(db: AdminDb, action: string, targetType: string, targetId: string, before: unknown, after: unknown, now = new Date()) {
  db.auditLogs.unshift({
    id: `log_${now.getTime().toString(36)}_${db.auditLogs.length}`, at: now.toISOString(), adminId: "system", adminName: "sistem",
    action, targetType, targetId, before, after,
  });
}

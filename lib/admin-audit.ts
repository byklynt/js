import "server-only";
import { getDb } from "@/lib/admin-db";
import { persistAdminState } from "@/lib/server/store";
import type { AuditLog } from "@/lib/admin-data";

/**
 * Records every admin write action (change balance, edit service, ban user, answer ticket, edit settings...).
 * Kept out of the "use server" action files on purpose: exporting it from there would expose it as a
 * public endpoint. TODO: persist to the real `audit_logs` table (append-only, no update/delete).
 */
export function logAdminAction(entry: {
  adminId: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
}): AuditLog {
  const db = getDb();
  const log: AuditLog = {
    id: `log_${db.auditLogs.length + 1}_${db.auditLogs.length * 7919 + 13}`,
    at: new Date().toISOString(),
    ...entry,
  };
  db.auditLogs.unshift(log);
  persistAdminState(db);
  return log;
}

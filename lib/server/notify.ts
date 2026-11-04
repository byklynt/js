/**
 * Telegram / email alert placeholders.
 * TODO(notify): POST to settings.notifications.telegramWebhook / emailWebhook. Today an alert is only recorded
 * in db.outbox (shown in /admin/logs as "alert.*") so the toggles and thresholds can be tested end to end.
 */
import type { AdminDb } from "@/lib/admin-data";
import { notifyAdmins } from "./notifications";
import { flaggedUsers } from "./risk";
import type { AlertKind, SentAlert } from "./types";

export { alertLabels } from "./alert-labels";

/** Records the alert when its toggle is on. De-duplicates the same message within 6 hours. */
export function sendAlert(db: AdminDb, kind: AlertKind, message: string, now = new Date()): SentAlert | null {
  const n = db.settings.notifications;
  if (!n.toggles[kind]) return null;
  const recent = db.outbox.find((a) => a.kind === kind && a.message === message && now.getTime() - new Date(a.at).getTime() < 6 * 3_600_000);
  if (recent) return null;
  const channels = [n.telegramWebhook ? "telegram" : "telegram (belum diatur)", n.emailWebhook ? "email" : "email (belum diatur)"];
  const alert: SentAlert = { id: `al_${now.getTime().toString(36)}_${db.outbox.length}`, at: now.toISOString(), kind, message, channels };
  db.outbox.unshift(alert);
  db.auditLogs.unshift({
    id: `log_${now.getTime().toString(36)}_${db.auditLogs.length}`, at: now.toISOString(), adminId: "system", adminName: "sistem",
    action: `alert.${kind}`, targetType: "alert", targetId: alert.id, before: null, after: { message, channels },
  });
  return alert;
}

/** Threshold checks run by the sync job. Each one only fires when its toggle is on. */
export function checkAlertThresholds(db: AdminDb, now = new Date(), stuckCount = 0, mismatchCount = 0) {
  const fired: SentAlert[] = [];
  const push = (a: SentAlert | null) => a && fired.push(a);
  const day = now.toISOString().slice(0, 10);
  // The bell always shows these (independent of the Telegram / email toggles).
  for (const p of db.providers) {
    if (p.balance < db.settings.operations.lowBalanceThreshold) notifyAdmins(db, { type: "sistem", title: `Saldo ${p.name} rendah`, body: `Tinggal Rp ${p.balance.toLocaleString("id-ID")}.`, href: "/admin/providers", dedupeKey: `provbal:${p.id}:${day}` }, now);
  }
  if (mismatchCount > 0) notifyAdmins(db, { type: "refund", title: "Refund tidak sesuai", body: `${mismatchCount} pesanan punya refund yang tidak sesuai perhitungan.`, href: "/admin/refunds?mismatch=1", dedupeKey: `mismatch:${day}:${mismatchCount}` }, now);
  if (stuckCount > 0) notifyAdmins(db, { type: "pesanan", title: "Pesanan macet", body: `${stuckCount} pesanan macet melewati batas.`, href: "/admin/orders?status=macet", dedupeKey: `stuck:${day}:${stuckCount}` }, now);
  const waiting = db.deposits.filter((d) => d.status === "menunggu").length;
  if (waiting > 0) notifyAdmins(db, { type: "deposit", title: `${waiting} deposit menunggu`, body: "Ada deposit yang perlu dikonfirmasi.", href: "/admin/deposits?status=menunggu", dedupeKey: `depwait:${day}:${waiting}` }, now);
  for (const f of flaggedUsers(db)) {
    const name = db.users.find((u) => u.id === f.userId)?.username ?? f.userId;
    notifyAdmins(db, { type: "sistem", title: `Pengguna ${name} ditandai`, body: `Rasio batal dan refund ${f.ratioPercent}%.`, href: "/admin/users?status=review", dedupeKey: `flagged:${f.userId}` }, now);
  }
  for (const p of db.providers) {
    if (p.balance < db.settings.operations.lowBalanceThreshold) push(sendAlert(db, "provider_balance_low", `Saldo ${p.name} tinggal Rp ${p.balance.toLocaleString("id-ID")}.`, now));
  }
  if (stuckCount > 0) push(sendAlert(db, "orders_stuck", `${stuckCount} pesanan macet lebih dari ${db.settings.operations.stuckHours} jam.`, now));
  if (mismatchCount > 0) push(sendAlert(db, "refund_mismatch", `${mismatchCount} pesanan punya refund yang tidak sesuai perhitungan.`, now));
  return fired;
}

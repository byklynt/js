/**
 * Typed schema of the order / refund / balance domain.
 * This mirrors the Postgres tables in ./schema.sql; the app currently runs on the in-memory mock store.
 */
import type { OrderStatus } from "@/lib/orders-data";

export type { OrderStatus };

export type LedgerType = "deposit" | "order" | "refund" | "adjustment" | "bonus";

/** Append-only. Balance is only ever changed through applyLedgerEntry(). */
export type LedgerEntry = {
  id: string;
  userId: string;
  type: LedgerType;
  /** Signed: credits positive, debits negative. */
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  refType: string;
  refId: string;
  note: string;
  createdBy: string;
  createdAt: string;
};

/**
 * dibatalkan / gagal_kirim / sebagian: decided by the system (provider cancel = 100%, gagal_kirim = 100%, partial = proportional).
 * user_cancel: the user asked to cancel; only the refund policy (e.g. 50% of the undelivered part) applies.
 */
export type RefundReason = "dibatalkan" | "sebagian" | "gagal_kirim" | "manual" | "user_cancel";
export type RefundSource = "auto" | "admin" | "user_request";
export type RefundStatus = "menunggu" | "selesai" | "ditolak";

export type RefundRecord = {
  id: string;
  orderId: string;
  userId: string;
  username: string;
  amount: number;
  reason: RefundReason;
  source: RefundSource;
  status: RefundStatus;
  processedBy: string | null;
  rejectReason: string | null;
  note: string | null;
  createdAt: string;
  processedAt: string | null;
  /** Set when a gagal_kirim order is submitted again and charged again (the refund no longer counts). */
  reversed: boolean;
  /** For user_cancel: the policy percent that was used (stored so later policy edits never change history). */
  policyPercent?: number;
  /** The amount was set by an admin instead of the formula (needs password + reason). */
  overridden?: boolean;
  /** The cancel request this refund belongs to (user_cancel only). */
  cancelRequestId?: string | null;
};

export type RequestStatus = "menunggu" | "berjalan" | "selesai" | "ditolak";

export type RefillRequestRecord = {
  id: string;
  orderId: string;
  userId: string;
  status: RequestStatus;
  providerRequestId: string | null;
  rejectReason: string | null;
  createdAt: string;
};

/** A user's cancel request, with the numbers the admin needs to decide. */
export type CancelRequestRecord = RefillRequestRecord & {
  ageHours?: number;
  remainsAtRequest?: number;
  calculatedRefund?: number;
  policyPercent?: number;
};

export type ProviderSyncRun = {
  id: string;
  providerId: string;
  startedAt: string;
  finishedAt: string;
  ordersChecked: number;
  ordersChanged: number;
  errors: number;
  errorMessage: string | null;
};

export type AdminAlert = {
  id: string;
  at: string;
  providerId: string;
  message: string;
};

/** The provider's side of an order (mock). Raw provider status strings are mapped by mapProviderStatus(). */
export type ProviderOrderState = {
  /** The provider's own status text, untouched (for diagnostics). `status` below is the canonical text the sync rules understand. */
  raw?: string;
  status: string;
  startCount: number;
  remains: number;
};

export type AlertKind =
  | "provider_balance_low"
  | "provider_sync_failing"
  | "orders_stuck"
  | "large_deposit"
  | "new_ticket"
  | "new_admin_login"
  | "refund_mismatch";

export type AdminSession = {
  id: string;
  adminId: string;
  ip: string;
  userAgent: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
};

export type SanityRun = {
  id: string;
  at: string;
  balanceMismatches: number;
  refundMismatches: number;
  discrepancies: number;
  stuck: number;
};

/** What the (placeholder) Telegram / email notifier "sent". TODO(notify): real delivery. */
export type SentAlert = { id: string; at: string; kind: AlertKind; message: string; channels: string[] };

export type AdminSecurity = {
  /** AES-GCM encrypted base32 TOTP secret (see crypto-at-rest.ts). Never the plain secret. */
  secretEnc: string | null;
  enabled: boolean;
  enabledAt: string | null;
  /** scrypt hashes of the one-time backup codes. */
  backupHashes: string[];
  /** Highest TOTP time step already accepted: a code from that step or older is a replay. */
  lastUsedStep: number;
};

/** A setup attempt that is not confirmed yet. Expires after 10 minutes. */
export type PendingTotp = { secretEnc: string; createdAt: string; expiresAt: string };

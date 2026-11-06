import { brand } from "@/lib/brand";
import type { OrderStatus } from "@/lib/orders-data";
import type { RefillRequest, RefillStatus } from "@/lib/refills-data";
import type { Ticket } from "@/lib/tickets-data";
import type { Announcement } from "@/lib/announcements-data";
import type { AppNotification } from "@/lib/notifications-data";
import { DEFAULT_CANCEL_POLICY, defaultOrderRules, type CancelPolicy, type OrderRuleSet, type RuleKey } from "@/lib/order-rules";
import type {
  AdminAlert,
  AdminSecurity,
  PendingTotp,
  AdminSession,
  AlertKind,
  SanityRun,
  SentAlert,
  CancelRequestRecord,
  LedgerEntry,
  ProviderOrderState,
  ProviderSyncRun,
  RefillRequestRecord,
  RefundRecord,
} from "@/lib/server/types";

// ---------------------------------------------------------------------------
// Types (shared by server and client code)
// ---------------------------------------------------------------------------

export type UserRank = "Starter" | "Silver" | "Gold" | "Reseller";
export type UserStatus = "aktif" | "diblokir";
/** Refund decision state (alias kept for the admin chips). */
export type ReviewStatus = "menunggu" | "selesai" | "ditolak";

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  balance: number;
  totalSpent: number;
  rank: UserRank;
  status: UserStatus;
  reseller: boolean;
  createdAt: string;
  notes: string[];
  /** Their orders and refunds wait for an admin (set from /admin/users). */
  manualApproval: boolean;
};

export type AdminOrder = {
  /** What the provider last said (raw text) and the last submit / sync error of this order. */
  providerStatus?: string | null;
  /** Custom Comments orders: how many comments were submitted (the text is loaded on demand). */
  commentCount?: number;
  /** Set when an admin cancelled the order for a policy violation (no refund). */
  violationReason?: string | null;
  syncError?: string | null;
  id: string;
  userId: string;
  username: string;
  serviceId: string;
  platform: string;
  name: string;
  link: string;
  charge: number;
  quantity: number;
  startCount: number;
  remains: number;
  status: OrderStatus;
  createdAt: string;
  providerId: string;
  providerOrderId: string;
  refillable: boolean;
  /** What the provider charged us (for profit). */
  providerCost: number;
  /** Sum of refunds that already went back to the user's balance. */
  refundedAmount: number;
  submitAttempts: number;
  lastSyncedAt: string | null;
  completedAt: string | null;
  /** Paid but not sent to the provider until an admin approves (flagged users). */
  held: boolean;
  /** The version of the platform's order rules the user accepted, and when. Orders cannot exist without it. */
  acceptedRulesVersion: string | null;
  acceptedAt: string | null;
  /** Sending to the provider ended in an unknown state (timeout / 5xx). NOT refunded automatically: an admin must check the provider first. */
  needsManualCheck?: boolean;
  /** Who cancelled it. "user" = forced cancel under the refund policy; "provider" = full automatic refund rules. */
  cancelledBy: "user" | "provider" | "admin" | null;
  cancelPolicyPercent: number | null;
};

export type ProviderStatus = "aktif" | "nonaktif";

/** Server-side record. The full API key never leaves the server; clients only get PublicProvider. */
export type ProviderRecord = {
  id: string;
  name: string;
  apiUrl: string;
  apiKey: string;
  balance: number;
  status: ProviderStatus;
  lastSync: string;
  /** Real providers (adapter based) carry their native currency and balance; the Rupiah `balance` is derived from it. */
  kind?: "likeo";
  currency?: string;
  balanceNative?: number;
  /** When the balance was last read from the provider (cached for 60 seconds). */
  balanceAt?: string | null;
  lastTest?: { ok: boolean; at: string; message: string } | null;
  /** Which mode produced balanceNative / lastTest. Data from another mode is cleared (reconcileProviderMode). The mode itself is never stored. */
  dataMode?: "mock" | "live" | "off";
};

export type PublicProvider = Omit<ProviderRecord, "apiKey"> & { apiKeyMasked: string };

export type MarkupType = "persen" | "tetap";

export type AdminService = {
  id: string;
  categoryId: string;
  categoryLabel: string;
  platform: string;
  name: string;
  badges: string[];
  providerId: string;
  providerServiceId: string;
  providerPrice: number;
  markupType: MarkupType;
  markup: number;
  min: number;
  max: number;
  refill: boolean;
  /** Refill window in days (null = default 30). */
  refillDays: number | null;
  cancel: boolean;
  active: boolean;
  sort: number;
  /** Set for services imported from a provider. providerName keeps the original name; name is the cleaned one. */
  providerName?: string;
  providerType?: string;
  /** The provider no longer lists it: the service is switched off (never deleted). */
  providerRemoved?: boolean;
  /** Provider's price per 1000 in the provider currency at the last sync (the Rupiah cost is providerPrice). */
  providerRate?: number;
  syncedAt?: string;
  imported?: boolean;
  /** Measured delivery-time numbers for this service (aggregates), if any. */
  estimate?: import("@/lib/service-estimate").EstimateStats;
  /** Manual estimate text set by an admin (shown until the measured data reaches the minimum). */
  estimateOverride?: string | null;
};

export type DepositStatus = "menunggu" | "berhasil" | "gagal" | "kedaluwarsa" | "dibatalkan";

export type AdminDeposit = {
  id: string;
  userId: string;
  username: string;
  method: string;
  amount: number;
  status: DepositStatus;
  createdAt: string;
  proof: string;
  /** Payment gateway transaction ID; UNIQUE so a webhook can never credit twice. */
  externalId: string | null;
  /** Paymenku deposits only (gateway = true). The rest are manual deposits. */
  gateway?: boolean;
  channelCode?: string | null;
  payAmount?: number | null;
  feeAmount?: number;
  /** The app added the fee to what the customer pays ("Teruskan biaya ke pelanggan"); amount is still the credited base. */
  feePassthrough?: boolean;
  gatewayStatus?: string | null;
  isSandbox?: boolean | null;
  expiresAt?: string | null;
  paidAt?: string | null;
  needsReview?: boolean;
  reviewReason?: string | null;
  /** Display-safe payment_info saved at creation (no keys, no customer data). */
  paymentInfo?: Record<string, unknown> | null;
};

export type AdminRefill = RefillRequest & { userId: string; username: string };
export type AdminRefund = RefundRecord;

export type AdminTicket = Ticket & {
  userId: string;
  username: string;
  assignee: string | null;
  internalNotes: { id: string; by: string; text: string; at: string }[];
};

export type { Announcement } from "@/lib/announcements-data";

export type AuditLog = {
  id: string;
  at: string;
  adminId: string;
  adminName: string;
  action: string;
  targetType: string;
  targetId: string;
  before: unknown;
  after: unknown;
};

export type SiteSettings = {
  general: { siteName: string; supportEmail: string; supportTelegram: string; maintenance: boolean };
  payments: {
    activeMethods: string[];
    minDeposit: number;
    bonusTiers: { min: number; percent: number }[];
    /** Paymenku top-ups (QRIS, VA, e-wallet). The API key and the webhook secret are environment variables, never settings. */
    gateway: {
      enabled: boolean;
      /** Largest top-up through the gateway (Rp). The smallest is minDeposit above. */
      maxDeposit: number;
      /** Who bears the channel fee: filters the channels offered (see lib/server/payments/gateway-rules.ts). */
      feePolicy: "ikuti" | "pengguna" | "kami";
      /** "Teruskan biaya ke pelanggan": the app adds the channel fee of merchant-billed channels to what the customer pays (default off). */
      feePassthrough: boolean;
      /** Channel codes (from Paymenku) the admin enabled. */
      channels: string[];
    };
  };
  ranks: { name: UserRank; minSpent: number; discountPercent: number }[];
  security: { requireAdmin2fa: boolean; /** Empty = off. IPv4 or IPv4/CIDR. */ ipAllowlist: string[] };
  notifications: {
    telegramWebhook: string;
    emailWebhook: string;
    toggles: Record<AlertKind, boolean>;
    /** Deposits at or above this amount raise a "large deposit" alert. */
    largeDepositAmount: number;
  };
  risk: { /** Cancel + refund share of orders (%) that flags a user. */ ratioPercent: number; minOrders: number };
  pricing: {
    minMarginPercent: number;
    autoAdjust: boolean;
    /** Provider currency -> Rupiah. TODO: fetch the rate automatically. */
    currency: string;
    rateIdr: number;
    /** Selling prices are rounded UP to this many Rupiah (1, 10, 100, ...). */
    roundTo: number;
    /** A synced service whose selling price per 1000 is above this (or whose name / category is under 3 characters) is imported INACTIVE and flagged "Perlu dicek". */
    reviewPriceThreshold: number;
    /** When true EVERY newly imported service starts inactive until an admin enables it. Off = new services start active (unless flagged). */
    newServicesInactive: boolean;
    /** Markup given to NEW imported services: category first, then provider, then the default. */
    defaultMarkup: { markupType: MarkupType; markup: number };
    providerMarkups: Record<string, { markupType: MarkupType; markup: number }>;
    categoryMarkups: Record<string, { markupType: MarkupType; markup: number }>;
  };
  limits: { ordersPerMinute: number; ticketsPerHour: number };
  ops: { lastBackupAt: string | null; monitoringDsn: string };
  /** What users must read and accept before ordering, per platform (edited in Ketentuan Order). */
  orderRules: Record<RuleKey, OrderRuleSet>;
  cancelPolicy: CancelPolicy;
  operations: {
    /** Orders still running after this many hours are flagged "macet". */
    stuckHours: number;
    /** Provider balance below this shows the low-balance chip. */
    lowBalanceThreshold: number;
    /** Disable a provider's services automatically when its balance is below the threshold. */
    autoDisableLowBalance: boolean;
  };
  /** Measured delivery-time estimates: show from this many completed orders; use the most recent `window` orders per service. */
  estimates: { minSamples: number; window: number };
  /** Optional links shown in the user sidebar and the footers when set (validated in lib/community-links.ts). */
  community: import("@/lib/community-links").CommunityLinks;
};

export type PriceUpdate = {
  id: string;
  serviceId: string;
  platform: string;
  name: string;
  type: "naik" | "turun" | "baru" | "nonaktif" | "perubahan";
  date: string;
  detail: string;
};

export type AdminAccount = {
  id: string;
  username: string;
  email: string;
  twoFactor: boolean;
};

export type AdminDb = {
  users: AdminUser[];
  orders: AdminOrder[];
  providers: ProviderRecord[];
  services: AdminService[];
  deposits: AdminDeposit[];
  refunds: AdminRefund[];
  tickets: AdminTicket[];
  announcements: Announcement[];
  auditLogs: AuditLog[];
  settings: SiteSettings;
  priceUpdates: PriceUpdate[];
  ledger: LedgerEntry[];
  refillRequests: RefillRequestRecord[];
  cancelRequests: CancelRequestRecord[];
  syncRuns: ProviderSyncRun[];
  notifications: AppNotification[];
  alerts: AdminAlert[];
  /** The provider's side of each order, keyed by provider order ID (mock). */
  providerOrders: Record<string, ProviderOrderState>;
  /** Provider IDs whose API is currently "down" (mock failure injection). */
  providerDown: string[];
  /** userId -> when the user last opened /dashboard/updates (clears the sidebar badge). */
  announcementSeen: Record<string, string>;
  sessions: AdminSession[];
  sanityRuns: SanityRun[];
  outbox: SentAlert[];
  adminSecurity: Record<string, AdminSecurity>;
  pending2fa: Record<string, PendingTotp>;
};

export const LOW_PROVIDER_BALANCE = 500000;


/** Selling prices are rounded UP to a multiple of this (settings.pricing.roundTo). Kept in step with the settings by setPriceRounding(). */
let priceRoundTo = 1;
export function setPriceRounding(n: number) {
  priceRoundTo = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}

export function finalPrice(s: Pick<AdminService, "providerPrice" | "markupType" | "markup">): number {
  const raw = s.markupType === "persen" ? s.providerPrice * (1 + s.markup / 100) : s.providerPrice + s.markup;
  // The first rounding removes floating point noise (110.00000000000001 must not become 111).
  const clean = Math.round(raw * 10_000) / 10_000;
  return Math.max(priceRoundTo, Math.ceil(clean / priceRoundTo) * priceRoundTo);
}

/** First-run site settings: safe defaults, nothing demo. Pricing (kurs, markup) starts unset-looking defaults the admin must confirm. */
export function defaultSettings(): SiteSettings {
  return {
    general: { siteName: brand.name, supportEmail: brand.supportEmail, supportTelegram: "@jagoansosmed_support", maintenance: false },
    payments: {
      activeMethods: ["manual"],
      minDeposit: 10_000,
      bonusTiers: [],
      gateway: { enabled: false, maxDeposit: 5_000_000, feePolicy: "ikuti", feePassthrough: false, channels: [] },
    },
    ranks: [
      { name: "Starter", minSpent: 0, discountPercent: 0 },
      { name: "Silver", minSpent: 1_000_000, discountPercent: 2 },
      { name: "Gold", minSpent: 5_000_000, discountPercent: 4 },
      { name: "Reseller", minSpent: 0, discountPercent: 8 },
    ],
    security: { requireAdmin2fa: true, ipAllowlist: [] },
    notifications: {
      telegramWebhook: "",
      emailWebhook: "",
      toggles: {
        provider_balance_low: true, provider_sync_failing: true, orders_stuck: true, large_deposit: true,
        new_ticket: false, new_admin_login: true, refund_mismatch: true,
      },
      largeDepositAmount: 1_000_000,
    },
    risk: { ratioPercent: 50, minOrders: 5 },
    pricing: {
      minMarginPercent: 5, autoAdjust: false, currency: "USD", rateIdr: 16_000, roundTo: 1, reviewPriceThreshold: 5_000_000, newServicesInactive: false,
      defaultMarkup: { markupType: "persen", markup: 40 }, providerMarkups: {}, categoryMarkups: {},
    },
    limits: { ordersPerMinute: 10, ticketsPerHour: 5 },
    ops: { lastBackupAt: null, monitoringDsn: "" },
    orderRules: defaultOrderRules(),
    cancelPolicy: { ...DEFAULT_CANCEL_POLICY },
    operations: { stuckHours: 24, lowBalanceThreshold: LOW_PROVIDER_BALANCE, autoDisableLowBalance: false },
    estimates: { minSamples: 3, window: 20 },
    community: { whatsappChannel: "", telegramChannel: "", telegramBot: "" },
  };
}

/** Development-only TOTP secret of the seeded owner account. */
export const DEV_OWNER_TOTP_SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

export const mockAdminAccounts: AdminAccount[] = [
  { id: "adm_1", username: "admin", email: "admin@jagoansosmed.com", twoFactor: false },
  { id: "adm_2", username: "owner", email: "owner@jagoansosmed.com", twoFactor: true },
];


/** The Likeo provider row. Balance stays empty until the live API call fills it; URL and key come from the environment only. */
export function likeoProviderRow(): ProviderRecord {
  return { id: "5c1e0a00-0000-4000-8000-00000000e001", name: "Likeo", apiUrl: "https://likeo.net/api/v2", apiKey: "", balance: 0, status: "aktif", lastSync: "", kind: "likeo", currency: "USD", balanceNative: undefined, balanceAt: null, lastTest: null, dataMode: undefined };
}

/**
 * First-run state: what is required to log in and operate, nothing else. No users, orders, services, tickets,
 * deposits, ledger entries, notifications or logs. Admin 2FA lives in the durable store, never here.
 */
export function createEmptyDb(): AdminDb {
  return {
    users: [], orders: [], providers: [likeoProviderRow()], services: [], deposits: [], refunds: [], tickets: [],
    announcements: [], auditLogs: [], settings: defaultSettings(), priceUpdates: [], ledger: [], refillRequests: [], cancelRequests: [],
    syncRuns: [], notifications: [], alerts: [], providerOrders: {}, providerDown: [], announcementSeen: {}, sessions: [], sanityRuns: [],
    outbox: [], adminSecurity: {}, pending2fa: {},
  };
}

export type { OrderStatus, RefillStatus };

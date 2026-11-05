import { z } from "zod";
import { COMMUNITY_FIELDS, validateCommunityUrl, type CommunityLinks } from "@/lib/community-links";
import { BAN_REASONS, VIOLATION_REASONS } from "@/lib/account-status";
import { isValidAllowlistEntry } from "@/lib/server/access";

// Server-side validation schemas for every admin form (used by the "use server" actions).

const id = z.string().trim().min(1).max(60);
const password = z.string().min(1, "Password wajib diisi untuk konfirmasi.").max(200);
const rupiah = z.coerce.number().int("Harus berupa angka bulat.").positive("Jumlah harus lebih dari 0.").max(1_000_000_000);

export const orderStatusEnum = z.enum(["menunggu", "diproses", "berjalan", "selesai", "sebagian", "dibatalkan", "gagal_kirim"]);

export const adjustBalanceSchema = z.object({
  userId: id,
  direction: z.enum(["tambah", "kurangi"]),
  amount: rupiah.max(100_000_000, "Maksimal Rp 100.000.000 per penyesuaian."),
  reason: z.string().trim().min(5, "Alasan minimal 5 karakter.").max(200),
  password,
});

export const userStatusSchema = z
  .object({
    userId: id,
    status: z.enum(["aktif", "diblokir"]),
    password,
    reason: z.enum(BAN_REASONS, { message: "Pilih alasan pemblokiran." }).optional(),
    note: z.string().trim().max(300, "Catatan maksimal 300 karakter.").optional(),
  })
  .refine((d) => d.status === "aktif" || d.reason !== undefined, { message: "Pilih alasan pemblokiran.", path: ["reason"] });
export const cancelViolationSchema = z.object({
  orderId: id,
  reason: z.enum(VIOLATION_REASONS, { message: "Pilih alasan pembatalan." }),
  note: z.string().trim().max(300, "Catatan maksimal 300 karakter.").optional(),
  password,
});
export const settleBalanceSchema = z.object({
  userId: id,
  choice: z.enum(["kembalikan", "hanguskan", "tahan"], { message: "Pilih salah satu keputusan." }),
  reason: z.string().trim().min(5, "Alasan minimal 5 karakter.").max(150, "Alasan maksimal 150 karakter."),
  password,
});
export const resellerSchema = z.object({ userId: id, reseller: z.boolean() });
export const userIdSchema = z.object({ userId: id });
export const userNoteSchema = z.object({ userId: id, text: z.string().trim().min(2, "Catatan terlalu pendek.").max(300) });

export const orderStatusSchema = z.object({ orderId: id, status: orderStatusEnum });
export const orderCountsSchema = z.object({
  orderId: id,
  startCount: z.coerce.number().int().min(0, "Awal tidak boleh negatif."),
  remains: z.coerce.number().int().min(0, "Sisa tidak boleh negatif."),
});
export const orderCancelSchema = z.object({ orderId: id, password });
export const orderResendSchema = z.object({ orderId: id });
export const bulkOrderStatusSchema = z.object({
  orderIds: z.array(id).min(1, "Pilih minimal satu pesanan.").max(200),
  status: orderStatusEnum,
});

const serviceFields = {
  name: z.string().trim().min(3, "Nama minimal 3 karakter.").max(160),
  providerId: id,
  providerServiceId: z.string().trim().min(1, "ID layanan provider wajib diisi.").max(40),
  providerPrice: z.coerce.number().positive("Harga provider harus lebih dari 0.").max(100_000_000),
  markupType: z.enum(["persen", "tetap"]),
  markup: z.coerce.number().min(0, "Markup tidak boleh negatif.").max(1_000_000),
  min: z.coerce.number().int().min(1, "Minimal 1."),
  max: z.coerce.number().int().min(1),
  refill: z.boolean(),
  cancel: z.boolean(),
  active: z.boolean(),
  sort: z.coerce.number().int().min(0).max(10_000),
};

export const serviceUpdateSchema = z
  .object({ id, ...serviceFields })
  .refine((v) => v.min <= v.max, { message: "Minimal tidak boleh lebih besar dari maksimal.", path: ["max"] });

export const serviceCreateSchema = z
  .object({ categoryId: id, ...serviceFields })
  .refine((v) => v.min <= v.max, { message: "Minimal tidak boleh lebih besar dari maksimal.", path: ["max"] });

export const bulkMarkupSchema = z.object({
  scope: z.string().trim().min(1),
  markupType: z.enum(["persen", "tetap"]),
  markup: z.coerce.number().min(0, "Markup tidak boleh negatif.").max(1_000_000),
  password,
});

/** Applying the catalogue sync: the fingerprint of the previewed diff must still match what the provider returns now. */
export const syncApplySchema = z.object({ fingerprint: z.string().trim().min(8).max(64), password });

export const pricingSettingsSchema = z.object({
  rateIdr: z.coerce.number().positive("Kurs harus lebih dari 0.").max(1_000_000, "Kurs terlalu besar."),
  roundTo: z.coerce.number().int("Harus angka bulat.").min(1, "Minimal 1.").max(1000, "Maksimal 1000."),
  defaultMarkupType: z.enum(["persen", "tetap"]),
  defaultMarkup: z.coerce.number().min(0, "Tidak boleh negatif.").max(100_000_000),
  providerMarkupType: z.enum(["persen", "tetap"]),
  providerMarkup: z.coerce.number().min(0, "Tidak boleh negatif.").max(100_000_000),
});

export const manualCheckSchema = z.object({
  orderId: id,
  outcome: z.enum(["refund", "sent"]),
  providerOrderId: z.string().trim().max(40).optional(),
  password,
});

export const csvImportSchema = z.object({ csv: z.string().min(1, "File CSV kosong.").max(500_000) });

export const providerIdSchema = z.object({ id });

export const depositConfirmSchema = z.object({ id, password });
export const depositRejectSchema = z.object({ id, reason: z.string().trim().min(3, "Alasan minimal 3 karakter.").max(200) });

export const reviewSchema = z.object({ id, action: z.enum(["setujui", "tolak", "selesai"]) });

/** Refund review: approving credits the user, so it needs password re-entry (checked in the action). */
export const refundReviewSchema = z.discriminatedUnion("action", [
  z.object({
    id,
    action: z.literal("setujui"),
    password,
    // Only for user cancellations: replace the policy amount. Needs the password (above) and a written reason.
    overrideAmount: z.coerce.number().int().positive().optional(),
    overrideReason: z.string().trim().max(300).optional(),
  }),
  z.object({ id, action: z.literal("tolak"), reason: z.string().trim().min(3, "Alasan penolakan wajib diisi.").max(300) }),
]);

export const refundCreateSchema = z.object({
  orderId: id,
  amount: rupiah,
  reason: z.string().trim().min(10, "Alasan minimal 10 karakter.").max(300),
  password,
});

export const orderRuleSchema = z.object({
  key: z.enum(["instagram", "tiktok", "youtube", "facebook", "twitter", "telegram", "spotify", "other"]),
  title: z.string().trim().min(3, "Judul minimal 3 karakter.").max(80),
  bullets: z.array(z.string().trim().min(3, "Setiap poin minimal 3 karakter.").max(240)).min(1, "Isi minimal satu poin.").max(12),
});
export const cancelPolicySchema = z.object({
  minAgeHours: z.coerce.number().int("Harus bilangan bulat.").min(0, "Tidak boleh negatif.").max(720, "Maksimal 720 jam."),
  refundPercent: z.coerce.number().int("Harus bilangan bulat.").min(0, "Minimal 0%.").max(100, "Maksimal 100%."),
});

export const resendAllSchema = z.object({ password });
export const resyncSchema = z.object({});

export const ticketReplySchema = z.object({
  ticketId: id,
  text: z.string().trim().min(2, "Balasan terlalu pendek.").max(2000),
  status: z.enum(["dibalas", "menunggu", "ditutup"]),
});
export const ticketStatusSchema = z.object({ ticketId: id, status: z.enum(["dibalas", "menunggu", "ditutup"]) });
export const ticketAssignSchema = z.object({ ticketId: id, assignee: z.string().trim().max(60).nullable() });
export const ticketNoteSchema = z.object({ ticketId: id, text: z.string().trim().min(2, "Catatan terlalu pendek.").max(500) });

export const announcementSchema = z.object({
  id: id.optional(),
  title: z.string().trim().min(3, "Judul minimal 3 karakter.").max(100),
  body: z.string().trim().min(10, "Isi minimal 10 karakter.").max(1000),
  audience: z.enum(["semua", "reseller"]),
  placements: z.array(z.enum(["dashboard", "pembaruan"])).min(1, "Pilih minimal satu tempat tampil."),
  level: z.enum(["info", "penting", "peringatan"]).default("info"),
  publishAt: z.string().min(1, "Jadwal tayang wajib diisi."),
  expiresAt: z.string().nullable().optional(),
  active: z.boolean(),
}).refine((v) => !v.expiresAt || new Date(v.expiresAt) > new Date(v.publishAt), { message: "Tanggal berakhir harus setelah jadwal tayang.", path: ["expiresAt"] });
export const announcementDeleteSchema = z.object({ id, confirm: z.literal("HAPUS", { message: "Ketik HAPUS untuk konfirmasi." }), password });

export const settingsGeneralSchema = z.object({
  siteName: z.string().trim().min(2).max(60),
  supportEmail: z.string().trim().email("Email tidak valid."),
  supportTelegram: z.string().trim().max(60),
  maintenance: z.boolean(),
});
/** Validated on the server (the form only helps): https, exact hosts, no credentials. Empty = disabled. Output is the normalized URLs. */
export const communityLinksSchema = z
  .object({ whatsappChannel: z.string().max(400).default(""), telegramChannel: z.string().max(400).default(""), telegramBot: z.string().max(400).default("") })
  .transform((d, ctx): CommunityLinks => {
    const out: CommunityLinks = { whatsappChannel: "", telegramChannel: "", telegramBot: "" };
    for (const f of COMMUNITY_FIELDS) {
      const r = validateCommunityUrl(d[f.key], f.kind);
      if (!r.ok) ctx.addIssue({ code: "custom", path: [f.key], message: `${f.label}: ${r.message}` });
      else out[f.key] = r.value;
    }
    return out;
  });
export const settingsPaymentsSchema = z.object({
  activeMethods: z.array(z.string()).min(1, "Aktifkan minimal satu metode."),
  minDeposit: z.coerce.number().int().min(1000, "Minimal Rp 1.000.").max(10_000_000),
  bonusTiers: z
    .array(z.object({ min: z.coerce.number().int().min(0), percent: z.coerce.number().min(0).max(50) }))
    .max(10),
});
export const settingsRanksSchema = z.object({
  ranks: z.array(
    z.object({
      name: z.enum(["Starter", "Silver", "Gold", "Reseller"]),
      minSpent: z.coerce.number().int().min(0),
      discountPercent: z.coerce.number().min(0).max(50),
    })
  ),
});
export const settingsOperationsSchema = z.object({
  stuckHours: z.coerce.number().int("Harus bilangan bulat.").min(1, "Minimal 1 jam.").max(720, "Maksimal 720 jam."),
  lowBalanceThreshold: z.coerce.number().int("Harus bilangan bulat.").min(0, "Tidak boleh negatif.").max(1_000_000_000),
  autoDisableLowBalance: z.boolean(),
  riskRatioPercent: z.coerce.number().int().min(1, "Minimal 1%.").max(100),
  riskMinOrders: z.coerce.number().int().min(1).max(1000),
  minMarginPercent: z.coerce.number().min(0, "Tidak boleh negatif.").max(90),
  autoAdjustPrice: z.boolean(),
  ordersPerMinute: z.coerce.number().int().min(1).max(600),
  ticketsPerHour: z.coerce.number().int().min(1).max(200),
  estimateMinSamples: z.coerce.number().int("Harus bilangan bulat.").min(1, "Minimal 1 pesanan.").max(50, "Maksimal 50 pesanan."),
  estimateWindow: z.coerce.number().int("Harus bilangan bulat.").min(3, "Minimal 3 pesanan.").max(200, "Maksimal 200 pesanan."),
});

export const serviceEstimateSchema = z.object({
  serviceId: id,
  /** Empty clears the manual text. */
  text: z.string().trim().max(40, "Maksimal 40 karakter.").refine((v) => v === "" || /^[\p{L}\p{N} .,:±~<>/+-]+$/u.test(v), "Gunakan huruf, angka, dan tanda baca sederhana. Contoh: 5 - 15 menit."),
});
export const serviceStatsResetSchema = z.object({ serviceId: id });

export const settingsMonitoringSchema = z.object({
  monitoringDsn: z.string().trim().max(300).refine((v) => v === "" || v.startsWith("https://"), "DSN harus memakai https."),
});

const ipEntry = z.string().trim().max(45).refine(isValidAllowlistEntry, "Alamat IP tidak valid. Contoh: 203.0.113.5 atau 203.0.113.0/24.");
export const ipAllowlistSchema = z.object({ ips: z.array(ipEntry).max(50), password });
export const sessionRevokeSchema = z.object({ id });
export const userApprovalSchema = z.object({ userId: id, manualApproval: z.boolean() });
export const orderApproveSchema = z.object({ orderId: id });
export const autoMarkupSchema = z.object({ serviceIds: z.array(id).max(500).optional(), password });

export const settingsSecuritySchema = z.object({ requireAdmin2fa: z.boolean(), password: z.string().max(200).optional() });
export const settingsNotificationsSchema = z.object({
  telegramWebhook: z.string().trim().max(300).refine((v) => v === "" || v.startsWith("https://"), "Webhook harus memakai https."),
  emailWebhook: z.string().trim().max(300).refine((v) => v === "" || v.startsWith("https://"), "Webhook harus memakai https."),
  toggles: z.object({
    provider_balance_low: z.boolean(), provider_sync_failing: z.boolean(), orders_stuck: z.boolean(), large_deposit: z.boolean(),
    new_ticket: z.boolean(), new_admin_login: z.boolean(), refund_mismatch: z.boolean(),
  }),
  largeDepositAmount: z.coerce.number().int().min(10_000, "Minimal Rp 10.000.").max(1_000_000_000),
});
export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Password saat ini wajib diisi."),
    next: z.string().min(10, "Password baru minimal 10 karakter.").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { message: "Konfirmasi password tidak cocok.", path: ["confirm"] })
  .refine((v) => v.next !== v.current, { message: "Password baru harus berbeda dari password saat ini.", path: ["next"] });

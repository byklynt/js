/**
 * DEMO SEED. Only used by tests and by scripts/seed-demo.ts (`npm run seed:demo`). The running app never imports this file:
 * normal startup seeds nothing (see createEmptyDb in lib/admin-data.ts).
 */
import { demoCategories as categories, demoServices as services, demoTickets, demoUserOrders as userOrders, demoUserRefills as userRefills } from "@/lib/dev/demo-data";
import { platforms } from "@/lib/dashboard-data";
import {
  createEmptyDb, type AdminDb, type AdminOrder, type AdminDeposit, type DepositStatus, type AdminRefill, type AdminService, type AdminTicket, type AdminUser, type AuditLog,
  type Announcement, type ProviderRecord, type UserRank,
} from "@/lib/admin-data";
import { computeExpectedRefund, isActiveStatus, refundReasonFor, toProviderStatus } from "@/lib/server/rules";
import type { OrderStatus } from "@/lib/orders-data";
import type { AppNotification } from "@/lib/notifications-data";
import type { LedgerEntry } from "@/lib/server/types";

/** The payment methods the demo deposits use. */
const demoPaymentMethods = [{ name: "QRIS" }, { name: "Transfer Bank" }, { name: "E-Wallet" }, { name: "Virtual Account" }];

export const MOCK_TODAY = "2026-11-04";
export const DEMO_PASSWORD = "demo12345";

// ---------------------------------------------------------------------------
// Seed data (mock). TODO: replace with the real database.
// ---------------------------------------------------------------------------

const names = [
  "budi_santoso", "siti_aisyah", "andi_pratama", "rina_wulandari", "dimas_arya", "nadia_putri",
  "fajar_nugroho", "lestari_dewi", "rizky_maulana", "anisa_rahma", "hendra_wijaya", "putri_amelia",
  "agus_salim", "maya_sari", "doni_kurnia", "wulan_hapsari", "eko_prasetyo", "intan_permata",
  "yoga_pratama", "citra_lestari", "bagus_setiawan", "dewi_anggraini", "galih_saputra", "tiara_ananda",
];

function rankFor(spent: number, reseller: boolean): UserRank {
  if (reseller) return "Reseller";
  if (spent >= 5_000_000) return "Gold";
  if (spent >= 1_000_000) return "Silver";
  return "Starter";
}

export function seedUsers(): AdminUser[] {
  // The mock logged-in user of the user dashboard, so user pages and admin pages share data.
  const demo: AdminUser = {
    id: "usr_1000",
    username: "jagoansosmed_user",
    email: "user@jagoansosmed.com",
    balance: 125000,
    totalSpent: 280000,
    rank: "Starter",
    status: "aktif",
    reseller: false,
    createdAt: "2026-09-01T09:00:00+07:00",
    notes: [],
    manualApproval: false,
  };
  const generated: AdminUser[] = names.map((username, i) => {
    const totalSpent = ((i * 7919) % 90) * 85_000 + (i % 5) * 40_000;
    const reseller = i % 9 === 4;
    const day = String(28 - (i % 27)).padStart(2, "0");
    const month = i < 14 ? "10" : "09";
    return {
      id: `usr_${1001 + i}`,
      username,
      email: `${username}@contoh.id`,
      balance: ((i * 104_729) % 900) * 1000 + (i % 4) * 5000,
      totalSpent,
      rank: rankFor(totalSpent, reseller),
      status: i === 5 || i === 13 || i === 20 ? "diblokir" : "aktif",
      reseller,
      createdAt: `2026-${month}-${day}T10:${String(10 + i).padStart(2, "0")}:00+07:00`,
      notes: i % 6 === 0 ? ["Pelanggan lama, sering order TikTok."] : [],
      manualApproval: false,
    };
  });
  return [demo, ...generated];
}

export function seedProviders(): ProviderRecord[] {
  return [
    {
      id: "prv_1", name: "Provider Alfa", apiUrl: "https://api.alfa-smm.example/v2",
      apiKey: "ak_live_9f3c71d2b84e6a05c9d1e7f3a2b64c88", balance: 4_250_000, status: "aktif",
      lastSync: "2026-11-04T08:15:00+07:00",
    },
    {
      id: "prv_2", name: "Provider Beta", apiUrl: "https://api.beta-panel.example/api",
      apiKey: "bk_live_51aa0e73c4d982f6b17e30d4a9c5f2e1", balance: 380_000, status: "aktif",
      lastSync: "2026-11-04T07:40:00+07:00",
    },
    {
      id: "prv_3", name: "Provider Gamma", apiUrl: "https://gamma-smm.example/api/v1",
      apiKey: "gk_live_c8e24b9d7a0f13e65d2b8a41f7c93e06", balance: 1_820_000, status: "nonaktif",
      lastSync: "2026-10-29T21:05:00+07:00",
    },
    {
      // The real provider. URL and key come from the environment (lib/server/providers/config.ts), never from this record.
      id: "prv_likeo", name: "Likeo", apiUrl: "https://likeo.net/api/v2", apiKey: "", balance: 1_208_000, status: "aktif",
      lastSync: "2026-11-04T08:00:00+07:00", kind: "likeo", currency: "USD", balanceNative: 75.5, balanceAt: null, lastTest: null, dataMode: "mock",
    },
  ];
}

function platformOf(name: string, categoryPlatform: string): string {
  if (categoryPlatform) return categoryPlatform;
  const lower = name.toLowerCase();
  return platforms.find((p) => lower.includes(p.label.toLowerCase().replace("/x", "")))?.id ?? "instagram";
}

export function seedServices(): AdminService[] {
  return services.map((s, i) => {
    const category = categories.find((c) => c.id === s.categoryId);
    const providerPrice = Math.max(1, Math.round(s.pricePer1000 / 1.4));
    return {
      id: s.id,
      categoryId: s.categoryId,
      categoryLabel: category?.label ?? "Lainnya",
      platform: platformOf(s.name, category?.platformId ?? ""),
      name: s.name,
      badges: s.badges,
      providerId: `prv_${(i % 3) + 1}`,
      providerServiceId: String(3100 + i * 7),
      providerPrice,
      markupType: "persen",
      // A few services sell at a thin margin so the "Margin tipis" flag has something to show.
      markup: i % 9 === 4 ? 3 : 40,
      min: s.min,
      max: s.max,
      refill: Boolean(s.refillDays),
      refillDays: s.refillDays,
      cancel: i % 3 === 0,
      active: i % 11 !== 10,
      sort: i + 1,
    };
  });
}

export function seedOrders(users: AdminUser[]): AdminOrder[] {
  const out: AdminOrder[] = [];
  const total = 36;
  for (let i = 0; i < total; i++) {
    const base = userOrders[i % userOrders.length];
    const isBase = i < userOrders.length;
    // The 12 original orders belong to the mock user of the user dashboard; the rest rotate over other users.
    const user = isBase ? users[0] : users[(i * 5 + 3) % users.length];
    const cycle = Math.floor(i / userOrders.length);
    const charge = base.charge + cycle * 700;
    let status: OrderStatus = base.status;
    // Two orders that could not be submitted to the provider.
    if (i === 21 || i === 29) status = "gagal_kirim";
    let createdAt = base.createdAt.replace(/-(\d\d)T/, (_m, d) => `-${String(Math.max(1, Number(d) - cycle)).padStart(2, "0")}T`);
    // A handful of orders placed "today" so today's revenue / profit / refund cards have data.
    if (i >= 12 && i <= 19) createdAt = `2026-11-04T${String(6 + (i - 12) * 2).padStart(2, "0")}:15:00+07:00`;
    const failed = status === "gagal_kirim";
    const finished = status === "selesai" || status === "sebagian";
    out.push({
      id: isBase ? base.id : String(7_100_000 - i * 311),
      userId: user.id,
      username: user.username,
      serviceId: base.serviceId,
      platform: base.platform,
      name: base.name,
      link: base.link,
      charge,
      quantity: base.quantity,
      startCount: failed ? 0 : base.startCount,
      remains: failed ? base.quantity : base.remains,
      status,
      createdAt,
      providerId: `prv_${(i % 3) + 1}`,
      providerOrderId: failed ? "" : `PRV-${880_000 + i * 13}`,
      refillable: base.refillable,
      providerCost: Math.round(charge * 0.72),
      refundedAmount: 0,
      submitAttempts: failed ? 3 : 1,
      lastSyncedAt: failed ? null : "2026-11-04T08:00:00+07:00",
      completedAt: finished ? createdAt : null,
      held: false,
      acceptedRulesVersion: base.status === "gagal_kirim" ? null : "v1",
      acceptedAt: createdAt,
      cancelledBy: null,
      cancelPolicyPercent: null,
    });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function seedDeposits(users: AdminUser[]): AdminDeposit[] {
  const statuses: DepositStatus[] = ["berhasil", "menunggu", "berhasil", "gagal", "berhasil", "kedaluwarsa", "menunggu", "berhasil"];
  const methods = demoPaymentMethods.map((m) => m.name);
  return Array.from({ length: 18 }, (_, i) => {
    const user = users[(i * 7 + 2) % users.length];
    return {
      id: String(216_000 - i * 37),
      userId: user.id,
      username: user.username,
      method: methods[i % methods.length],
      amount: [25_000, 50_000, 100_000, 250_000, 500_000, 75_000][i % 6],
      status: statuses[i % statuses.length],
      createdAt: `2026-11-0${(i % 4) + 1}T${String(8 + (i % 12)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}:00+07:00`,
      proof: `bukti-transfer-${216_000 - i * 37}.png`,
      externalId: statuses[i % statuses.length] === "berhasil" ? `PAY-${216_000 - i * 37}` : null,
    };
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function seedRefills(users: AdminUser[]): AdminRefill[] {
  return userRefills.map((r, i) => {
    const user = users[(i * 3 + 1) % users.length];
    return { ...r, userId: user.id, username: user.username };
  });
}

export function seedTickets(users: AdminUser[]): AdminTicket[] {
  return demoTickets.map((t, i) => {
    // The first tickets belong to the mock signed-in user (usr_1000) so the user area shows real history.
    const user = i < 6 ? users[0] : users[(i * 2 + 1) % users.length];
    return {
      ...t,
      // From the admin's side a ticket needs attention when the last message is the user's.
      status: t.status,
      userId: user.id,
      username: user.username,
      assignee: i % 3 === 0 ? "admin" : null,
      internalNotes: i === 0 ? [{ id: "n1", by: "admin", text: "Pelanggan prioritas, cek provider Alfa.", at: "2026-10-11T15:00:00+07:00" }] : [],
    };
  });
}

export function seedAnnouncements(): Announcement[] {
  const base = { createdBy: "admin", expiresAt: null as string | null, level: "info" as const };
  return [
    {
      ...base, id: "ann_1", title: "Diskon deposit akhir bulan", audience: "semua", placements: ["dashboard", "pembaruan"],
      body: "Dapatkan bonus deposit hingga 6% untuk deposit di atas Rp 1.000.000 sampai 30 November.",
      publishAt: "2026-11-01T09:00:00+07:00", active: true, createdAt: "2026-10-30T10:00:00+07:00", updatedAt: "2026-10-30T10:00:00+07:00",
    },
    {
      ...base, id: "ann_2", title: "Jadwal pemeliharaan sistem", audience: "semua", placements: ["dashboard"], level: "penting",
      body: "Pemeliharaan singkat pada Minggu pukul 02.00 - 03.00 WIB. Pesanan tetap berjalan seperti biasa.",
      publishAt: "2026-11-05T02:00:00+07:00", active: true, createdAt: "2026-11-03T09:00:00+07:00", updatedAt: "2026-11-03T09:00:00+07:00",
    },
    {
      ...base, id: "ann_3", title: "Harga khusus reseller", audience: "reseller", placements: ["dashboard", "pembaruan"],
      body: "Peringkat Reseller kini mendapat tambahan diskon 3% untuk layanan Instagram dan TikTok.",
      publishAt: "2026-10-28T10:00:00+07:00", active: true, createdAt: "2026-10-27T10:00:00+07:00", updatedAt: "2026-10-27T10:00:00+07:00",
    },
    {
      ...base, id: "ann_4", title: "Layanan YouTube sedang gangguan", audience: "semua", placements: ["pembaruan"], level: "peringatan",
      body: "Beberapa layanan YouTube melambat karena gangguan penyedia. Tim kami sedang menanganinya.",
      publishAt: "2026-10-20T08:30:00+07:00", active: false, createdAt: "2026-10-20T08:00:00+07:00", updatedAt: "2026-10-20T08:00:00+07:00",
    },
  ];
}

export function seedAuditLogs(): AuditLog[] {
  return [
    { id: "log_1", at: "2026-11-03T16:20:11+07:00", adminId: "adm_1", adminName: "admin", action: "user.balance.adjust", targetType: "user", targetId: "usr_1003", before: { balance: 120000 }, after: { balance: 170000, reason: "Kompensasi pesanan gagal" } },
    { id: "log_2", at: "2026-11-03T14:05:42+07:00", adminId: "adm_2", adminName: "owner", action: "service.update", targetType: "service", targetId: "12004", before: { markup: 35 }, after: { markup: 40 } },
    { id: "log_3", at: "2026-11-02T20:48:09+07:00", adminId: "adm_1", adminName: "admin", action: "user.ban", targetType: "user", targetId: "usr_1006", before: { status: "aktif" }, after: { status: "diblokir" } },
    { id: "log_4", at: "2026-11-02T11:30:55+07:00", adminId: "adm_1", adminName: "admin", action: "ticket.reply", targetType: "ticket", targetId: "126697", before: null, after: { status: "dibalas" } },
    { id: "log_5", at: "2026-11-01T09:12:30+07:00", adminId: "adm_2", adminName: "owner", action: "settings.update", targetType: "settings", targetId: "general", before: { maintenance: true }, after: { maintenance: false } },
    { id: "log_6", at: "2026-10-31T17:44:18+07:00", adminId: "adm_1", adminName: "admin", action: "deposit.confirm", targetType: "deposit", targetId: "215870", before: { status: "menunggu" }, after: { status: "berhasil" } },
  ];
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}_${++seq}`;

/** Ledger, refunds, requests, provider-side state, sync history and notifications (mock history). */
function seedOps(db: AdminDb) {
  // Link every mock order to a real service of the same platform (so cancel / refill rules can look it up).
  db.orders.forEach((o, i) => {
    const pool = db.services.filter((sv) => sv.active && sv.platform === o.platform && (!o.refillable || sv.refill));
    const fallback = db.services.filter((sv) => sv.active && (!o.refillable || sv.refill));
    const list = pool.length ? pool : fallback;
    const sv = list[i % list.length];
    o.serviceId = sv.id;
    o.name = `${sv.id} - ${sv.name}`;
    o.providerId = sv.providerId;
  });

  // --- one user with many cancelled / partial orders so the "Perlu ditinjau" flag has something to show
  const risky = db.users.find((u) => u.username === "dimas_arya");
  if (risky) {
    // (the mock signed-in user keeps their own orders)
    db.orders.filter((o) => o.userId !== "usr_1000").slice(2, 10).forEach((o, i) => {
      o.userId = risky.id;
      o.username = risky.username;
      if (i % 2 === 0 && o.status !== "gagal_kirim") o.status = i % 4 === 0 ? "dibatalkan" : "sebagian";
    });
  }

  // --- the mock user always has one old running order on a service that allows cancel (so the "Ajukan pembatalan" flow can be tried)
  const oldRunning = db.orders
    .filter((o) => o.userId === "usr_1000" && (o.status === "berjalan" || o.status === "diproses" || o.status === "menunggu"))
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
  if (oldRunning) {
    const cancelable = db.services.find((sv) => sv.active && sv.cancel && sv.platform === oldRunning.platform) ?? db.services.find((sv) => sv.active && sv.cancel);
    if (cancelable) {
      oldRunning.serviceId = cancelable.id;
      oldRunning.name = `${cancelable.id} - ${cancelable.name}`;
      oldRunning.providerId = cancelable.providerId;
    }
  }
  // Running orders of the mock user are partly delivered (40%), so a cancellation has something left to refund.
  for (const o of db.orders) {
    if (o.userId === "usr_1000" && (o.status === "berjalan" || o.status === "diproses")) o.remains = Math.round(o.quantity * 0.6);
  }

  // --- provider side: mirrors the panel, then a few deliberate differences for the reconciliation card
  for (const o of db.orders) {
    if (o.providerOrderId) {
      db.providerOrders[o.providerOrderId] = { status: toProviderStatus(o.status), startCount: o.startCount, remains: o.remains };
    }
  }
  const active = db.orders.filter((o) => isActiveStatus(o.status) && o.providerOrderId);
  if (active[0]) db.providerOrders[active[0].providerOrderId].status = "Canceled";
  if (active[1]) db.providerOrders[active[1].providerOrderId] = { status: "Partial", startCount: 120, remains: Math.floor(active[1].quantity * 0.4) };
  if (active[2]) db.providerOrders[active[2].providerOrderId].status = "Completed";

  // --- automatic refunds for orders that already ended as dibatalkan / sebagian / gagal_kirim
  let skippedPartial = false;
  for (const o of db.orders) {
    const reason = refundReasonFor(o.status);
    if (!reason) continue;
    const expected = computeExpectedRefund(o);
    // One partial order is intentionally left unrefunded: the "calculated vs actual" check flags it.
    if (reason === "sebagian" && !skippedPartial) {
      skippedPartial = true;
      continue;
    }
    if (expected <= 0) continue;
    db.refunds.push({
      id: nextId("rf"),
      orderId: o.id,
      userId: o.userId,
      username: o.username,
      amount: expected,
      reason,
      source: "auto",
      status: "selesai",
      processedBy: null,
      rejectReason: null,
      note: null,
      createdAt: o.createdAt,
      processedAt: o.createdAt,
      reversed: false,
    });
    o.refundedAmount = expected;
  }

  // --- decisions waiting for an admin: manual / user-requested refunds on finished orders
  const finishedOrders = db.orders.filter((o) => o.status === "selesai" && o.refundedAmount === 0);
  const queue: [number, "user_request" | "admin", number][] = [[0, "user_request", 0.3], [1, "user_request", 0.5], [2, "admin", 0.2], [3, "user_request", 1]];
  queue.forEach(([idx, source, share], i) => {
    const o = finishedOrders[idx];
    if (!o) return;
    db.refunds.push({
      id: nextId("rf"),
      orderId: o.id,
      userId: o.userId,
      username: o.username,
      amount: Math.max(1, Math.floor(o.charge * share)),
      reason: "manual",
      source,
      status: i === 3 ? "ditolak" : "menunggu",
      processedBy: i === 3 ? "admin" : null,
      rejectReason: i === 3 ? "Pesanan sudah terkirim penuh." : null,
      note: source === "user_request" ? "Pengguna meminta refund sebagian." : null,
      createdAt: "2026-11-03T10:00:00+07:00",
      processedAt: i === 3 ? "2026-11-03T15:00:00+07:00" : null,
      reversed: false,
    });
  });

  // --- ledger (history starts with an opening balance; flows after that are real entries)
  type Flow = { userId: string; type: LedgerEntry["type"]; amount: number; refType: string; refId: string; note: string; at: string };
  const flows: Flow[] = [];
  for (const d of db.deposits) {
    if (d.status === "berhasil") flows.push({ userId: d.userId, type: "deposit", amount: d.amount, refType: "deposit", refId: d.id, note: `Deposit ${d.method}`, at: d.createdAt });
  }
  for (const r of db.refunds) {
    if (r.status === "selesai") flows.push({ userId: r.userId, type: "refund", amount: r.amount, refType: "refund", refId: r.id, note: `Refund pesanan #${r.orderId} (${r.reason})`, at: r.processedAt ?? r.createdAt });
  }
  for (const user of db.users) {
    const mine = flows.filter((f) => f.userId === user.id).sort((a, b) => (a.at < b.at ? -1 : 1));
    const credits = mine.reduce((sum, f) => sum + f.amount, 0);
    if (user.balance < credits) user.balance = credits;
    let balance = 0;
    const opening = user.balance - credits;
    const push = (f: Omit<Flow, "userId">) => {
      db.ledger.push({
        id: nextId("lg"), userId: user.id, type: f.type, amount: f.amount, balanceBefore: balance, balanceAfter: balance + f.amount,
        refType: f.refType, refId: f.refId, note: f.note, createdBy: "system", createdAt: f.at,
      });
      balance += f.amount;
    };
    push({ type: "adjustment", amount: opening, refType: "opening", refId: user.id, note: "Saldo awal (sebelum buku besar dipakai)", at: "2026-09-01T00:00:00+07:00" });
    for (const f of mine) push(f);
  }
  db.ledger.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  // --- refill requests (the user-facing refill mock, linked to real orders) and cancel requests
  userRefills.forEach((r, i) => {
    const order = db.orders.find((o) => o.id === r.orderId) ?? db.orders[i];
    db.refillRequests.push({ id: r.id, orderId: order.id, userId: order.userId, status: r.status, providerRequestId: `PRQ-${r.id}`, rejectReason: r.status === "ditolak" ? "Masa refill sudah berakhir." : null, createdAt: r.createdAt });
  });
  active.slice(3, 5).forEach((o, i) => {
    db.cancelRequests.push({ id: `cx_${i + 1}`, orderId: o.id, userId: o.userId, status: i === 0 ? "menunggu" : "ditolak", providerRequestId: i === 0 ? "PCX-1" : null, rejectReason: i === 0 ? null : "Provider menolak: pesanan sudah diproses.", createdAt: "2026-11-04T07:00:00+07:00" });
  });

  // --- provider sync history: providers 1 and 2 healthy, provider 3 failing 3 runs in a row
  db.providers.forEach((p, idx) => {
    for (let k = 0; k < 3; k++) {
      const failing = idx === 2;
      const minute = 40 - k * 2;
      db.syncRuns.push({
        id: nextId("sr"), providerId: p.id, startedAt: `2026-11-04T08:${String(minute).padStart(2, "0")}:00+07:00`,
        finishedAt: `2026-11-04T08:${String(minute).padStart(2, "0")}:04+07:00`, ordersChecked: failing ? 0 : 6 + k, ordersChanged: failing ? 0 : k, errors: failing ? 1 : 0,
        errorMessage: failing ? "Provider API tidak merespons" : null,
      });
    }
  });
  db.syncRuns.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  db.alerts.push({ id: "al_1", at: "2026-11-04T08:40:04+07:00", providerId: "prv_3", message: "Provider Gamma gagal sinkron 3 kali berturut-turut." });

  db.sanityRuns.push({ id: "sn_1", at: "2026-11-04T01:00:00+07:00", balanceMismatches: 0, refundMismatches: 1, discrepancies: 0, stuck: 3 });

  // --- bell notifications (user and admin) so the popover has history on first open
  const note = (userId: string, type: AppNotification["type"], title: string, body: string, href: string, minutesAgo: number, read: boolean): AppNotification => {
    const at = new Date(Date.parse("2026-11-05T01:00:00+07:00") - minutesAgo * 60_000).toISOString();
    return { id: `nt_seed_${seq++}`, userId, type, title, body, href, readAt: read ? at : null, dedupeKey: `seed:${userId}:${title}`, createdAt: at };
  };
  const demoRefund = db.refunds.find((r) => r.userId === "usr_1000" && r.status === "selesai");
  db.notifications.push(
    ...(demoRefund ? [note("usr_1000", "refund", `Refund Rp ${demoRefund.amount.toLocaleString("id-ID")} masuk`, `Refund untuk pesanan #${demoRefund.orderId} sudah masuk ke saldomu.`, "/dashboard/refunds", 40, false)] : []),
    note("usr_1000", "pesanan", "Pesanan #7025157 selesai", "Buka halaman pesanan untuk melihat detailnya.", "/dashboard/orders?search=7025157", 300, false),
    note("usr_1000", "deposit", "Deposit Rp 100.000 berhasil", "Saldomu bertambah termasuk bonus Rp 3.000.", "/dashboard/add-funds", 1500, true),
    note("usr_1000", "pengumuman", "Diskon deposit akhir bulan", "Dapatkan bonus deposit hingga 6% untuk deposit di atas Rp 1.000.000.", "/dashboard/updates", 3000, true),
    note("adm_1", "tiket", "Tiket baru #127301", "Tiket baru dari pengguna menunggu balasan.", "/admin/tickets", 25, false),
    note("adm_1", "deposit", "5 deposit menunggu", "Ada deposit yang perlu dikonfirmasi.", "/admin/deposits?status=menunggu", 90, false),
    note("adm_1", "sistem", "Provider Gamma gagal sinkron 3x", "Periksa koneksi provider.", "/admin/providers", 400, true),
    note("adm_2", "tiket", "Tiket baru #127301", "Tiket baru dari pengguna menunggu balasan.", "/admin/tickets", 25, false),
    note("adm_2", "deposit", "5 deposit menunggu", "Ada deposit yang perlu dikonfirmasi.", "/admin/deposits?status=menunggu", 90, false)
  );
}

export function seedDemoDb(): AdminDb {
  seq = 0;
  const users = seedUsers();
  const db: AdminDb = {
    users,
    orders: seedOrders(users),
    providers: seedProviders(),
    services: seedServices(),
    deposits: seedDeposits(users),
    refills: seedRefills(users),
    refunds: [],
    tickets: seedTickets(users),
    announcements: seedAnnouncements(),
    auditLogs: seedAuditLogs(),
    settings: createEmptyDb().settings,
    priceUpdates: [],
    ledger: [],
    refillRequests: [],
    cancelRequests: [],
    syncRuns: [],
    notifications: [],
    alerts: [],
    providerOrders: {},
    providerDown: [],
    announcementSeen: {},
    sessions: [],
    sanityRuns: [],
    outbox: [],
    // Admin 2FA is never seeded here: it lives in the durable store (lib/server/store.ts) and must survive reseeds.
    adminSecurity: {},
    pending2fa: {},
  };
  seedOps(db);
  return db;
}


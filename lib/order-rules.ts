/**
 * Pre-order rules per platform and the cancel policy. Client-safe data and helpers only.
 * The values users read and accept live in the settings (admin edits them in /admin/settings -> Ketentuan Order);
 * the defaults below are the starting point. Every text that quotes a number (72 jam, 50%) is generated from the
 * same settings by cancelPolicyBullet() / cancelPolicySentences(), so the order form, the order page dialog and
 * /refund-policy can never disagree.
 */

export type RuleKey = "instagram" | "tiktok" | "youtube" | "facebook" | "twitter" | "telegram" | "spotify" | "other";

export type OrderRuleSet = {
  key: RuleKey;
  label: string;
  title: string;
  bullets: string[];
  /** Bumped on every edit. An order is only accepted with the current version of its platform's rules. */
  version: string;
  updatedAt: string;
};

export type CancelPolicy = {
  /** A user can ask to cancel only after the order is this old. */
  minAgeHours: number;
  /** Share (in percent) of the UNDELIVERED part that is refunded for a user-requested cancellation. */
  refundPercent: number;
};

export const RULE_KEYS: RuleKey[] = ["instagram", "tiktok", "youtube", "facebook", "twitter", "telegram", "spotify", "other"];

export const RULE_LABELS: Record<RuleKey, string> = {
  instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", facebook: "Facebook", twitter: "Twitter/X", telegram: "Telegram", spotify: "Spotify", other: "Platform lain",
};

export const DEFAULT_CANCEL_POLICY: CancelPolicy = { minAgeHours: 72, refundPercent: 50 };

/** Maps any platform id used in the catalogue ("website-traffic", "twitch"...) to a rule set. */
export function ruleKeyFor(platform: string | undefined | null): RuleKey {
  const p = (platform ?? "").toLowerCase();
  return (RULE_KEYS as string[]).includes(p) && p !== "other" ? (p as RuleKey) : "other";
}

const NO_DOUBLE = "Jangan membuat pesanan kedua untuk link yang sama sebelum pesanan pertama selesai.";
const NO_WRONG_LINK = "Link yang salah tidak bisa dibatalkan maupun direfund. Periksa link sebelum memesan.";

const DEFAULT_TEXT: Record<RuleKey, { title: string; bullets: string[] }> = {
  instagram: {
    title: "Sebelum order Instagram",
    bullets: [
      "Akun harus berstatus publik selama pesanan berjalan.",
      "Matikan fitur tinjau manual untuk tag, sebutan, dan komentar (pengaturan \"tinjau\") di akunmu.",
      "Jangan mengganti username atau mengubah akun menjadi privat saat pesanan masih berjalan.",
      NO_DOUBLE,
      NO_WRONG_LINK,
    ],
  },
  tiktok: {
    title: "Sebelum order TikTok",
    bullets: [
      "Akun dan video harus publik. Video yang dibatasi atau akun privat tidak bisa diproses.",
      "Jangan menghapus video atau mengganti username selama pesanan berjalan.",
      "Pastikan video tidak diatur hanya untuk teman atau pengikut tertentu.",
      NO_DOUBLE,
      NO_WRONG_LINK,
    ],
  },
  youtube: {
    title: "Sebelum order YouTube",
    bullets: [
      "Video atau kanal harus publik atau tidak publik (unlisted). Video privat tidak bisa diproses.",
      "Jangan menghapus video, memberi batas usia, atau menutup kolom komentar selama pesanan berjalan.",
      "Jangan mengganti link video setelah memesan.",
      NO_DOUBLE,
      NO_WRONG_LINK,
    ],
  },
  facebook: {
    title: "Sebelum order Facebook",
    bullets: [
      "Profil atau halaman harus publik, dan pengaturan pengikut harus diizinkan.",
      "Jangan mengganti nama pengguna atau mengunci profil selama pesanan berjalan.",
      "Gunakan link profil atau postingan yang lengkap, bukan tautan pendek.",
      NO_DOUBLE,
      NO_WRONG_LINK,
    ],
  },
  twitter: {
    title: "Sebelum order Twitter/X",
    bullets: [
      "Akun tidak boleh dilindungi (protected) selama pesanan berjalan.",
      "Jangan mengganti username atau menghapus postingan yang dipesan.",
      "Gunakan link postingan atau profil yang valid.",
      NO_DOUBLE,
      NO_WRONG_LINK,
    ],
  },
  telegram: {
    title: "Sebelum order Telegram",
    bullets: [
      "Kanal atau grup harus publik dan punya username.",
      "Jangan mengganti username kanal atau menghapus postingan selama pesanan berjalan.",
      "Untuk views, kirim link postingan; untuk anggota, kirim link kanal atau grup.",
      NO_DOUBLE,
      NO_WRONG_LINK,
    ],
  },
  spotify: {
    title: "Sebelum order Spotify",
    bullets: [
      "Playlist, artis, atau lagu harus publik dan bisa dibuka tanpa login.",
      "Jangan mengubah playlist menjadi privat atau menghapus lagu selama pesanan berjalan.",
      "Gunakan link Spotify yang lengkap.",
      NO_DOUBLE,
      NO_WRONG_LINK,
    ],
  },
  other: {
    title: "Sebelum order",
    bullets: [
      "Pastikan akun atau halaman target publik dan bisa dibuka tanpa login.",
      "Jangan mengganti link, username, atau menghapus konten selama pesanan berjalan.",
      NO_DOUBLE,
      NO_WRONG_LINK,
    ],
  },
};

export const RULES_DEFAULT_UPDATED_AT = "2026-11-05T00:00:00+07:00";

export function defaultOrderRules(): Record<RuleKey, OrderRuleSet> {
  return Object.fromEntries(
    RULE_KEYS.map((key) => [key, { key, label: RULE_LABELS[key], ...DEFAULT_TEXT[key], bullets: [...DEFAULT_TEXT[key].bullets], version: "v1", updatedAt: RULES_DEFAULT_UPDATED_AT }])
  ) as Record<RuleKey, OrderRuleSet>;
}

/** "v3" -> "v4". Anything else becomes "v2". */
export function nextRuleVersion(version: string): string {
  const n = Number(/^v(\d+)$/.exec(version)?.[1] ?? "1");
  return `v${n + 1}`;
}

/** The line shown in the pre-order card and in the confirm dialog. Numbers come from the settings. */
export function cancelPolicyBullet(policy: CancelPolicy): string {
  return `Pembatalan oleh pengguna baru bisa diajukan setelah pesanan berumur ${policy.minAgeHours} jam, dan hanya ${policy.refundPercent}% dari bagian yang belum terkirim yang dikembalikan.`;
}

/** Short form of the prohibited-content rule, shown in the pre-order card (the full text is in the Syarat & Ketentuan). Same for every platform. */
export const CONTENT_POLICY_BULLET =
  "Order untuk akun, konten, atau tautan terkait politik (kampanye, partai, tokoh politik, propaganda) dan konten SARA, kekerasan, pornografi, perjudian, atau penipuan tidak diterima. Pelanggaran: pesanan dibatalkan tanpa refund dan akun dapat diblokir permanen.";

/** The explicit distinction, used by /refund-policy: user cancel versus everything the system decides itself. */
export function cancelPolicySentences(policy: CancelPolicy) {
  return {
    user: `Pembatalan yang kamu ajukan sendiri: baru bisa diajukan setelah pesanan berumur ${policy.minAgeHours} jam. Jika disetujui, kamu menerima ${policy.refundPercent}% dari bagian yang belum terkirim (biaya pesanan dikali sisa dibagi jumlah pesanan, dikali ${policy.refundPercent}%, dibulatkan ke bawah).`,
    provider: "Dibatalkan oleh penyedia layanan atau gagal dikirim ke penyedia: seluruh biaya pesanan dikembalikan otomatis (100%), tanpa syarat usia.",
    partial: "Pesanan sebagian (partial): kamu menerima biaya pesanan dikali sisa yang belum terkirim dibagi jumlah pesanan, dibulatkan ke bawah (100% dari bagian yang belum terkirim).",
  };
}

/** Hours until `availableAt`, for the countdown on the orders page. Never negative. */
export function msUntil(availableAtIso: string, now = Date.now()): number {
  return Math.max(0, new Date(availableAtIso).getTime() - now);
}

export function formatCountdown(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days} hari ${hours} jam`;
  if (hours > 0) return `${hours} jam ${minutes} menit`;
  return `${minutes} menit`;
}

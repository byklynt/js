export type TicketStatus = "dibalas" | "menunggu" | "ditutup";

export type TicketAttachment = {
  id: string;
  name: string;
  size: number;
  type: string;
  /** Data URL (mock storage). TODO: replace with a signed URL from real file storage. */
  url: string;
};

export type TicketMessage = {
  id: string;
  from: "user" | "support";
  text: string;
  at: string;
  attachments?: TicketAttachment[];
};

export type Ticket = {
  id: string;
  title: string;
  status: TicketStatus;
  updatedAt: string;
  /** True when the support team replied and the user has not opened the ticket yet. */
  unread: boolean;
  messages: TicketMessage[];
  /** Order IDs the user mentioned (Refill, Batalkan...). */
  orderIds?: string[];
};

export const ticketStatusLabels: Record<TicketStatus, string> = {
  dibalas: "Dibalas",
  menunggu: "Menunggu",
  ditutup: "Ditutup",
};

export const ticketCategories = [
  { value: "pesanan", label: "Pesanan" },
  { value: "layanan", label: "Layanan" },
  { value: "pembayaran", label: "Pembayaran" },
  { value: "lainnya", label: "Lainnya" },
] as const;

export type TicketCategory = (typeof ticketCategories)[number]["value"];

export const ticketSubcategories: Record<TicketCategory, string[]> = {
  pesanan: ["Refill", "Batalkan", "Percepat", "Lainnya"],
  layanan: ["Saran Layanan", "Layanan Bermasalah", "Pertanyaan", "Lainnya"],
  pembayaran: ["Deposit Belum Masuk", "Metode Pembayaran", "Refund", "Lainnya"],
  lainnya: ["Akun", "API", "Reseller", "Lainnya"],
};

/** Subcategories of "Pesanan" that require at least one order ID. */
export const orderIdRequiredSubcategories = ["Refill", "Batalkan"];

export const allowedAttachmentTypes = ["image/png", "image/jpeg", "application/pdf"];
/** A closed ticket can be reopened only while the last support reply is newer than this. */
export const REOPEN_WINDOW_MS = 7 * 24 * 3_600_000;
export const maxMessageLength = 2000;
export const maxAttachments = 3;
export const maxAttachmentBytes = 5 * 1024 * 1024;

function conversation(
  id: string,
  userText: string,
  userAt: string,
  replyText: string | null,
  replyAt?: string
): TicketMessage[] {
  const list: TicketMessage[] = [{ id: `${id}-1`, from: "user", text: userText, at: userAt }];
  if (replyText && replyAt) {
    list.push({ id: `${id}-2`, from: "support", text: replyText, at: replyAt });
  }
  return list;
}

// Mock data. TODO: load from the support backend.
export const initialTickets: Ticket[] = [
  {
    id: "127276", title: "Pesanan - Percepat", status: "dibalas", updatedAt: "2026-10-11T14:37:05+07:00", unread: false,
    messages: conversation("127276", "Pesanan 7025157 sudah dua hari belum selesai, bisa dipercepat?", "2026-10-11T10:02:11+07:00",
      "Halo! Pesananmu sudah kami dorong ke antrean prioritas dan akan selesai dalam beberapa jam.", "2026-10-11T14:37:05+07:00"),
  },
  {
    id: "126698", title: "Pesanan - Refill", status: "dibalas", updatedAt: "2026-10-06T00:37:08+07:00", unread: false,
    messages: conversation("126698", "Jumlah followers turun setelah 10 hari, mohon di-refill. Pesanan 6932877.", "2026-10-05T21:15:40+07:00",
      "Refill sudah kami ajukan. Pantau lagi dalam 24 jam ya.", "2026-10-06T00:37:08+07:00"),
  },
  {
    id: "126697", title: "Pesanan - Refill", status: "dibalas", updatedAt: "2026-10-06T00:35:52+07:00", unread: true,
    messages: conversation("126697", "Mohon refill untuk pesanan 6996240, views berkurang sebagian.", "2026-10-05T21:10:02+07:00",
      "Refill untuk pesanan tersebut sedang berjalan. Terima kasih sudah menunggu.", "2026-10-06T00:35:52+07:00"),
  },
  {
    id: "126696", title: "Pesanan - Refill", status: "dibalas", updatedAt: "2026-10-06T00:34:50+07:00", unread: true,
    messages: conversation("126696", "Tolong refill pesanan 6996050 ya.", "2026-10-05T21:08:30+07:00",
      "Sudah kami proses. Jika masih turun setelah 2 hari, balas tiket ini.", "2026-10-06T00:34:50+07:00"),
  },
  {
    id: "126446", title: "Pesanan - Percepat", status: "dibalas", updatedAt: "2026-10-03T10:04:06+07:00", unread: false,
    messages: conversation("126446", "Bisa dipercepat untuk pesanan 6890125? Targetnya sore ini.", "2026-10-03T08:40:00+07:00",
      "Kami sudah meneruskan permintaanmu ke tim teknis.", "2026-10-03T10:04:06+07:00"),
  },
  {
    id: "126349", title: "Pesanan - Percepat", status: "dibalas", updatedAt: "2026-10-02T09:55:57+07:00", unread: false,
    messages: conversation("126349", "Pesanan 6871934 masih di status menunggu. Mohon dicek.", "2026-10-02T07:20:19+07:00",
      "Pesananmu sudah berjalan sekarang. Mohon maaf atas keterlambatannya.", "2026-10-02T09:55:57+07:00"),
  },
  {
    id: "126280", title: "Pesanan - Percepat", status: "dibalas", updatedAt: "2026-10-01T15:23:12+07:00", unread: true,
    messages: conversation("126280", "Mohon dipercepat, pelanggan saya menunggu hasilnya.", "2026-10-01T13:01:44+07:00",
      "Tim kami sedang menanganinya dan akan mengabari lagi di sini.", "2026-10-01T15:23:12+07:00"),
  },
  {
    id: "126115", title: "Lainnya", status: "dibalas", updatedAt: "2026-10-01T11:37:22+07:00", unread: true,
    messages: conversation("126115", "Apakah ada program reseller dengan harga khusus?", "2026-10-01T09:55:30+07:00",
      "Ada. Kamu bisa membuka menu Panel Anak atau membalas tiket ini untuk detail paketnya.", "2026-10-01T11:37:22+07:00"),
  },
  {
    id: "125902", title: "Pembayaran - Deposit Belum Masuk", status: "menunggu", updatedAt: "2026-09-29T18:12:40+07:00", unread: false,
    messages: conversation("125902", "Saya sudah transfer Rp 250.000 tapi saldo belum bertambah. Bukti transfer terlampir.", "2026-09-29T18:12:40+07:00", null),
  },
  {
    id: "125610", title: "Layanan - Saran Layanan", status: "ditutup", updatedAt: "2026-09-24T16:48:03+07:00", unread: false,
    messages: conversation("125610", "Bisa ditambahkan layanan komentar custom untuk Telegram?", "2026-09-24T12:30:00+07:00",
      "Terima kasih atas sarannya, sudah kami catat untuk tim produk. Tiket ini kami tutup.", "2026-09-24T16:48:03+07:00"),
  },
];

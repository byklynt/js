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


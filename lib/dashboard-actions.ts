import { refreshBalance } from "@/lib/balance";
import { changeMyEmail, changeMyPassword, saveMySettings, submitDeposit, submitMassOrder, submitOrder, submitRefill } from "@/lib/user-actions";
import { createTicketAction, replyTicketAction } from "@/lib/ticket-actions";

export type ActionResult = { success: true } | { success: false; message: string };

export type CreateOrderPayload = {
  serviceId: string;
  link: string;
  quantity: number;
  /** Custom Comments only: one comment per line. The server counts them and refuses a different quantity. */
  comments?: string;
};

export type CreateBulkOrderPayload = {
  lines: { serviceId: string; link: string; quantity: number }[];
};

export async function createOrder(payload: CreateOrderPayload): Promise<ActionResult> {
  const res = await submitOrder(payload);
  if (res.ok) {
    refreshBalance();
    return { success: true };
  }
  return { success: false, message: res.error };
}

export async function requestRefill(orderId: string): Promise<ActionResult> {
  const res = await submitRefill(orderId);
  return res.ok ? { success: true } : { success: false, message: res.error };
}

/** "Laporkan pesanan": opens a support ticket about that order. */
export async function reportOrder(payload: { orderId: string; message: string }): Promise<ActionResult> {
  const res = await createTicket({ category: "Pesanan", subcategory: "Lainnya", orderIds: [payload.orderId], message: payload.message, files: [] });
  return res.success ? { success: true } : { success: false, message: res.message };
}

/** Deposit request. No payment gateway yet: it stays pending until an admin confirms the transfer. */
export async function createDeposit(payload: { amount: number; method: string }): Promise<ActionResult> {
  const res = await submitDeposit({ amount: payload.amount, methodId: payload.method });
  return res.ok ? { success: true } : { success: false, message: res.error };
}

export type CreateTicketPayload = {
  category: string;
  subcategory: string;
  orderIds: string[];
  message: string;
  files: File[];
};

export type CreateTicketResult = { success: true; id: string; redirectTo: string } | { success: false; message: string };

/** Creates the ticket on the server (validation, ownership, rate limit) and returns its id. */
export async function createTicket(payload: CreateTicketPayload): Promise<CreateTicketResult> {
  const form = new FormData();
  form.set("category", payload.category);
  form.set("subcategory", payload.subcategory);
  form.set("orderIds", JSON.stringify(payload.orderIds));
  form.set("message", payload.message);
  for (const file of payload.files) form.append("files", file);
  const res = await createTicketAction(form);
  return res.ok ? { success: true, id: res.id, redirectTo: res.redirectTo } : { success: false, message: res.error };
}

/** Sends a reply on the user's own ticket (the server re-checks ownership, status, text and files). */
export async function replyTicket(ticketId: string, message: string, files: File[] = []) {
  const form = new FormData();
  form.set("ticketId", ticketId);
  form.set("message", message);
  for (const file of files) form.append("files", file);
  return replyTicketAction(form);
}

export type MassOrderLine = { serviceId: string; link: string; quantity: number };

export type MassOrderResult =
  | { success: true; orderIds: string[] }
  | { success: false; message: string };

export async function createMassOrder(lines: MassOrderLine[]): Promise<MassOrderResult> {
  const res = await submitMassOrder(lines);
  if (res.ok) {
    refreshBalance();
    return { success: true, orderIds: (res.data as { orderIds: string[] }).orderIds };
  }
  return { success: false, message: res.error };
}

export async function changePassword(payload: { currentPassword: string; newPassword: string }): Promise<ActionResult> {
  const res = await changeMyPassword(payload);
  return res.ok ? { success: true } : { success: false, message: res.error };
}

export async function changeEmail(payload: { newEmail: string; password: string }): Promise<ActionResult> {
  const res = await changeMyEmail(payload);
  return res.ok ? { success: true } : { success: false, message: res.error };
}

/** Saves one personal settings section (invoice, notifications, timezone, experience) for the signed-in user. */
export async function saveSettings(section: string, values: Record<string, unknown>): Promise<ActionResult> {
  const res = await saveMySettings({ section, values });
  return res.ok ? { success: true } : { success: false, message: res.error };
}

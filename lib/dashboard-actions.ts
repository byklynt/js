import { refreshBalance } from "@/lib/balance";
import { submitMassOrder, submitOrder, submitRefill } from "@/lib/user-actions";
import { createTicketAction, replyTicketAction } from "@/lib/ticket-actions";

export type ActionResult = { success: true } | { success: false; message: string };

export type CreateOrderPayload = {
  serviceId: string;
  link: string;
  quantity: number;
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

export async function createBulkOrder(payload: CreateBulkOrderPayload): Promise<ActionResult> {
  const res = await submitMassOrder(payload.lines);
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

// TODO: replace this stub with a real API call that opens a support ticket for the order.
export async function reportOrder(payload: {
  orderId: string;
  message: string;
}): Promise<ActionResult> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  console.log("[dashboard-actions] reportOrder stub called with", payload);
  return { success: true };
}

// TODO: integrate a real payment gateway here. This stub never calls any payment API.
export async function createDeposit(payload: {
  amount: number;
  method: string;
}): Promise<ActionResult> {
  await new Promise((resolve) => setTimeout(resolve, 900));
  console.log("[dashboard-actions] createDeposit stub called with", payload);
  return { success: true };
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

// TODO: replace this stub with a real API call (e.g. POST /api/auth/change-password).
export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
}): Promise<ActionResult> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  console.log("[dashboard-actions] changePassword stub called", Object.keys(payload));
  return { success: true };
}

// TODO: replace this stub with a real API call (e.g. POST /api/account/change-email).
export async function changeEmail(payload: {
  newEmail: string;
  password: string;
}): Promise<ActionResult> {
  await new Promise((resolve) => setTimeout(resolve, 800));
  console.log("[dashboard-actions] changeEmail stub called with", payload.newEmail);
  return { success: true };
}

// TODO: replace this stub with a real 2FA enrolment call (verify the TOTP code server-side).
export async function enable2FA(code: string): Promise<ActionResult> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  console.log("[dashboard-actions] enable2FA stub called with code length", code.length);
  return { success: true };
}

// TODO: replace this stub with a real call that verifies the password and disables 2FA.
export async function disable2FA(password: string): Promise<ActionResult> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  console.log("[dashboard-actions] disable2FA stub called", password.length > 0);
  return { success: true };
}

// TODO: replace this stub with a real call that persists the given settings section.
export async function saveSettings(
  section: string,
  values: Record<string, unknown>
): Promise<ActionResult> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  console.log("[dashboard-actions] saveSettings stub called", section, values);
  return { success: true };
}

// TODO: replace this stub with a real call that rotates the API key server-side.
export async function regenerateApiKey(): Promise<{ success: true; key: string }> {
  await new Promise((resolve) => setTimeout(resolve, 600));
  const chars = "abcdef0123456789";
  let key = "sg_live_";
  for (let i = 0; i < 32; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return { success: true, key };
}

// TODO: replace this stub with a real payout request.
export async function requestPayout(amount: number): Promise<ActionResult> {
  await new Promise((resolve) => setTimeout(resolve, 700));
  console.log("[dashboard-actions] requestPayout stub called with", amount);
  return { success: true };
}

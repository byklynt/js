import "server-only";
import { BLOCKED_MESSAGE } from "@/lib/account-status";
import { callFn } from "./repo/rpc";
import { logSystem, rupiah } from "./repo/notify";
import { loadSettings } from "./repo/settings";
import { ServiceError } from "./tx";
import { supabaseAdmin } from "./supabase-admin";

/**
 * Credit a successful deposit (+ bonus by tier) exactly once, inside Postgres (credit_deposit).
 * Idempotent three ways: external transaction id is UNIQUE, deposit status, and ledger keys.
 * The admin "konfirmasi manual" button (manual deposits) calls this; Paymenku deposits go through paymenku_settle_deposit, which calls it after verifying with the gateway.
 */
export async function creditDeposit(input: { depositId: string; externalId: string | null; amount?: number; by: string }): Promise<{ duplicate: boolean; bonus: number }> {
  const { data: dep } = await supabaseAdmin().from("deposits").select("user_id,amount,method").eq("id", input.depositId).maybeSingle();
  if (!dep) throw new ServiceError("Deposit tidak ditemukan.", "no_deposit");
  const [row] = await callFn("credit_deposit", {
    p_external_id: (input.externalId ?? null) as string, p_user_id: dep.user_id, p_amount: input.amount ?? Number(dep.amount), p_method: dep.method, p_deposit_id: input.depositId, p_by: input.by,
  });
  return { duplicate: row.duplicate, bonus: Number(row.bonus) };
}

export const MAX_PENDING_DEPOSITS = 5;

/** A user asks to top up. With no payment gateway this is a pending row an admin confirms (creditDeposit) after the money arrived. */
export async function createDepositRequest(input: { userId: string; amount: number; methodId: string }): Promise<{ id: string; username: string; amount: number }> {
  const db = supabaseAdmin();
  const { data: user } = await db.from("profiles").select("username,status").eq("id", input.userId).maybeSingle();
  if (!user) throw new ServiceError("Pengguna tidak ditemukan.", "no_user");
  if (user.status !== "aktif") throw new ServiceError(BLOCKED_MESSAGE, "blocked");
  const { minDeposit, activeMethods } = (await loadSettings()).payments;
  if (!Number.isInteger(input.amount) || input.amount < minDeposit) throw new ServiceError(`Minimal deposit ${rupiah(minDeposit)}.`, "below_min");
  if (input.amount > 100_000_000) throw new ServiceError("Maksimal deposit Rp 100.000.000 per permintaan.", "above_max");
  if (!activeMethods.includes(input.methodId)) throw new ServiceError("Metode pembayaran tidak tersedia.", "bad_method");
  const { count } = await db.from("deposits").select("id", { count: "exact", head: true }).eq("user_id", input.userId).eq("status", "menunggu");
  if ((count ?? 0) >= MAX_PENDING_DEPOSITS) throw new ServiceError("Masih ada beberapa deposit yang menunggu konfirmasi. Tunggu atau hubungi support.", "too_many_pending");
  const { data, error } = await db.from("deposits").insert({ user_id: input.userId, method: methodLabel(input.methodId), amount: input.amount, status: "menunggu" }).select("id").single();
  if (error) throw new Error(`deposits: ${error.message}`);
  await logSystem("deposit.request", "deposit", data.id, null, { amount: input.amount, method: methodLabel(input.methodId) });
  return { id: data.id, username: user.username, amount: input.amount };
}

const METHOD_LABELS: Record<string, string> = { manual: "Transfer manual", qris: "QRIS", bank: "Transfer Bank", ewallet: "E-Wallet", va: "Virtual Account" };
export const methodLabel = (id: string) => METHOD_LABELS[id] ?? id;

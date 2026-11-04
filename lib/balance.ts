// Single mock balance source shared by the top bar and the dashboard "Saldo Akun" card.
// TODO: replace with the real balance from the JagoanSosmed backend.
export const mockBalance = 125000;

export const BALANCE_EVENT = "sg:balance-refresh";

/** Ask the top bar to re-read the balance (after an order, refund, deposit...). Client only. */
export function refreshBalance() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(BALANCE_EVENT));
}

export function formatBalance(value: number): string {
  return `Rp${value.toLocaleString("id-ID")}`;
}

export function formatIdr(value: number): string {
  return `Rp ${value.toLocaleString("id-ID")}`;
}

/** Fixed time zone keeps server and client output identical (no hydration mismatch). */
const dateTimeFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

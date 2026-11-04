/** Calendar helpers in the business time zone (Asia/Jakarta, WIB). Pure: no server-only, usable in tests. */
const TZ = "Asia/Jakarta";

/** "YYYY-MM-DD" of the given instant in WIB. */
export function dayOf(d: Date | string | number): string {
  return new Date(d).toLocaleDateString("sv-SE", { timeZone: TZ });
}

export const todayIso = (now: Date = new Date()): string => dayOf(now);

/** Hour of day (0-23) in WIB. */
export function hourOf(d: Date | string | number): number {
  return Number(new Date(d).toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: TZ })) % 24;
}

export function shiftDay(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

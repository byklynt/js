const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

/** Short id-ID date (fixed time zone so server and client agree). */
export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

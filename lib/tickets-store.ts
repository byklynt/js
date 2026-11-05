"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getUnreadTicketCountAction } from "@/lib/ticket-actions";
import { useRealtimeRefresh } from "@/lib/use-realtime";

/**
 * The unread-ticket badge in the sidebar. The number comes from the server (tickets live in the server store);
 * this hook only reads it. It refreshes on navigation, every minute, and whenever something calls
 * refreshTicketBadge() (a ticket was opened, a reply arrived). TODO: push it over a realtime channel instead.
 */
const EVENT = "sg:tickets-refresh";

export function refreshTicketBadge() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function useUnreadTicketCount(): number {
  const [count, setCount] = useState(0);
  const pathname = usePathname();
  // A support reply creates a notification (RLS: own rows) -> refresh the badge at once; the minute poll stays as fallback.
  useRealtimeRefresh("notifications", refreshTicketBadge, "tickets");

  useEffect(() => {
    let alive = true;
    const load = () => void getUnreadTicketCountAction().then((n) => alive && setCount(n)).catch(() => {});
    load();
    window.addEventListener(EVENT, load);
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.removeEventListener(EVENT, load);
      window.clearInterval(timer);
    };
  }, [pathname]);

  return count;
}

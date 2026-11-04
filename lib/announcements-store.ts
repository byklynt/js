"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getUnseenUpdatesCountAction } from "@/lib/announcement-actions";

/**
 * The badge on "Pembaruan" in the sidebar. The count comes from the server (it depends on the user's role and on
 * when they last opened the updates page). Refreshes on navigation, every minute, and on refreshUpdatesBadge().
 */
const EVENT = "sg:updates-refresh";

export function refreshUpdatesBadge() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function useUnseenUpdatesCount(): number {
  const [count, setCount] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const load = () => void getUnseenUpdatesCountAction().then((n) => alive && setCount(n)).catch(() => {});
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

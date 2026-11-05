"use client";

import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";

/**
 * Realtime push for the bell and the ticket badge. Uses the anon client with the signed-in user's own session, so Postgres
 * Realtime applies the same RLS as a normal read (notifications: own rows; ticket_messages: own tickets, never internal notes;
 * admins read everything through their admin policies). `onChange` just triggers the existing refresh; the polling that was
 * there stays as the fallback when the socket is blocked or not connected yet. Nothing sensitive is read from the payload.
 */
export function useRealtimeRefresh(table: "notifications" | "ticket_messages", onChange: () => void, scope = "user") {
  useEffect(() => {
    let cleanup = () => {};
    let cancelled = false;
    try {
      const supabase = getBrowserClient();
      void supabase.auth.getSession().then(({ data }) => {
        const session = data.session;
        if (!session || cancelled) return;
        const filter = table === "notifications" ? { filter: `user_id=eq.${session.user.id}` } : {};
        const channel = supabase
          .channel(`${scope}-${table}-${session.user.id}`)
          .on("postgres_changes", { event: "INSERT", schema: "public", table, ...filter }, () => onChange())
          .subscribe();
        cleanup = () => void supabase.removeChannel(channel);
      });
    } catch {
      // Supabase browser env missing or blocked: polling keeps working.
    }
    return () => {
      cancelled = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, scope]);
}

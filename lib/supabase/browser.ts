"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/** Anon/publishable client for the browser. Used for Realtime subscriptions only; RLS protects every row it can see. */
let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase publik belum dikonfigurasi.");
  client ??= createBrowserClient<Database>(url, key);
  return client;
}

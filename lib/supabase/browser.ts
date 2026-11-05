"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/** Anon client for the browser. Used for Realtime subscriptions only; RLS protects every row it can see. */
let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

export function getBrowserClient() {
  client ??= createBrowserClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  return client;
}

/** Public Supabase settings (safe for the browser). The service role key is NOT here: see lib/server/supabase-admin.ts. */
export function supabaseUrl(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_URL belum diatur (lihat .env.example).");
  return v;
}

export function supabaseAnonKey(): string {
  const v = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!v) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY belum diatur (lihat .env.example).");
  return v;
}

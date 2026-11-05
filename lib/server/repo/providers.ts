import "server-only";
import type { ProviderRecord } from "@/lib/admin-data";
import { decryptSecret, encryptSecret, getProviderEncKey } from "@/lib/server/crypto-at-rest";
import { LIKEO_DEFAULT_URL, LIKEO_ID } from "@/lib/server/providers/config";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { Tables } from "@/lib/supabase/database.types";

type ProviderRow = Tables<"providers">;

/** The provider as the admin UI knows it. The API key NEVER appears here (apiKey is always empty). */
export function toProviderRecord(r: ProviderRow): ProviderRecord {
  const lastTest = r.last_test as ProviderRecord["lastTest"];
  return {
    id: r.id, name: r.name, apiUrl: r.api_url || LIKEO_DEFAULT_URL, apiKey: "", balance: Number(r.balance_idr ?? 0),
    status: r.active ? "aktif" : "nonaktif", lastSync: r.last_sync_at ?? "", kind: r.slug === "likeo" ? "likeo" : undefined,
    currency: r.currency, balanceNative: r.balance_native === null ? undefined : Number(r.balance_native), balanceAt: r.balance_at,
    lastTest: lastTest ?? null, dataMode: r.mode as ProviderRecord["dataMode"],
  };
}

const PUBLIC_COLUMNS = "id,name,slug,api_url,mode,active,currency,exchange_rate,balance_native,balance_idr,balance_at,low_balance_threshold,last_test,last_sync_at,created_at,updated_at";

export async function loadProviders(): Promise<ProviderRecord[]> {
  const { data, error } = await supabaseAdmin().from("providers").select(PUBLIC_COLUMNS).order("created_at");
  if (error) throw new Error(`providers: ${error.message}`);
  return (data ?? []).map((r) => toProviderRecord(r as ProviderRow));
}

export async function loadProvider(id: string = LIKEO_ID): Promise<ProviderRecord | null> {
  const { data } = await supabaseAdmin().from("providers").select(PUBLIC_COLUMNS).eq("id", id).maybeSingle();
  return data ? toProviderRecord(data as ProviderRow) : null;
}

/**
 * URL and key used for live calls. The key is stored ENCRYPTED in providers.api_key_encrypted (PROVIDER_KEY_ENC_KEY);
 * the environment (LIKEO_API_KEY) is only a fallback for a project that has not been bootstrapped. Server only, never returned.
 */
export async function likeoCredentials(): Promise<{ apiUrl: string; apiKey: string | null }> {
  const { data } = await supabaseAdmin().from("providers").select("api_url,api_key_encrypted").eq("id", LIKEO_ID).maybeSingle();
  const apiUrl = process.env.LIKEO_API_URL?.trim() || data?.api_url || LIKEO_DEFAULT_URL;
  let apiKey: string | null = null;
  if (data?.api_key_encrypted) {
    try {
      apiKey = decryptSecret(data.api_key_encrypted, getProviderEncKey());
    } catch {
      apiKey = null; // wrong/missing PROVIDER_KEY_ENC_KEY: fall back to the environment, loudly in the logs
      console.error("[provider] kunci provider tidak bisa didekripsi. PROVIDER_KEY_ENC_KEY berubah?");
    }
  }
  apiKey ??= process.env.LIKEO_API_KEY?.trim() || null;
  return { apiUrl, apiKey };
}

export async function storeProviderKey(providerId: string, plain: string): Promise<void> {
  const { error } = await supabaseAdmin().from("providers").update({ api_key_encrypted: encryptSecret(plain, getProviderEncKey()) }).eq("id", providerId);
  if (error) throw new Error(`providers: ${error.message}`);
}

export async function updateProvider(id: string, patch: Partial<{
  active: boolean; currency: string; exchange_rate: number | null; balance_native: number | null; balance_idr: number | null;
  balance_at: string | null; last_test: unknown; last_sync_at: string; low_balance_threshold: number; mode: string;
}>): Promise<void> {
  const { error } = await supabaseAdmin().from("providers").update(patch as never).eq("id", id);
  if (error) throw new Error(`providers: ${error.message}`);
}

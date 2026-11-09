import "server-only";
import type { ProviderRecord } from "@/lib/admin-data";
import { decryptSecret, encryptSecret, getProviderEncKey } from "@/lib/server/crypto-at-rest";
import { LIKEO_DEFAULT_URL, LIKEO_ID } from "@/lib/server/providers/config";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { Tables } from "@/lib/supabase/database.types";

type ProviderRow = Tables<"providers">;

/** The provider as the admin UI knows it. The API key NEVER appears here (apiKey is always empty). */
export function toProviderRecord(r: ProviderRow, keySaved = false): ProviderRecord {
  const lastTest = r.last_test as ProviderRecord["lastTest"];
  const known = r.balance_idr !== null && r.balance_idr !== undefined;
  return {
    id: r.id, name: r.name, apiUrl: r.api_url || (r.id === LIKEO_ID ? LIKEO_DEFAULT_URL : ""), apiKey: "", balance: Number(r.balance_idr ?? 0),
    status: r.active ? "aktif" : "nonaktif", lastSync: r.last_sync_at ?? "", kind: r.slug === "likeo" ? "likeo" : undefined,
    currency: r.currency, balanceNative: r.balance_native === null ? undefined : Number(r.balance_native), balanceAt: r.balance_at,
    lastTest: lastTest ?? null, dataMode: r.mode as ProviderRecord["dataMode"],
    slug: r.slug, adapterType: (r.adapter_type ?? "smm-v2") as "smm-v2", exchangeRate: r.exchange_rate === null || r.exchange_rate === undefined ? null : Number(r.exchange_rate),
    keySaved, balanceKnown: known,
  };
}

const PUBLIC_COLUMNS = "id,name,slug,api_url,mode,active,currency,exchange_rate,balance_native,balance_idr,balance_at,low_balance_threshold,last_test,last_sync_at,created_at,updated_at,adapter_type";

/** Ids of the providers that have a stored key. Only presence is read: the encrypted value is never selected into app objects. */
async function providersWithKey(): Promise<Set<string>> {
  const { data } = await supabaseAdmin().from("providers").select("id").not("api_key_encrypted", "is", null);
  return new Set((data ?? []).map((r) => r.id as string));
}

const envKeyFor = (id: string) => id === LIKEO_ID && Boolean(process.env.LIKEO_API_KEY?.trim());

export async function loadProviders(): Promise<ProviderRecord[]> {
  const [{ data, error }, withKey] = await Promise.all([supabaseAdmin().from("providers").select(PUBLIC_COLUMNS).order("created_at"), providersWithKey()]);
  if (error) throw new Error(`providers: ${error.message}`);
  return (data ?? []).map((r) => toProviderRecord(r as unknown as ProviderRow, withKey.has(r.id as string) || envKeyFor(r.id as string)));
}

export async function loadProvider(id: string = LIKEO_ID): Promise<ProviderRecord | null> {
  const { data } = await supabaseAdmin().from("providers").select(PUBLIC_COLUMNS).eq("id", id).maybeSingle();
  if (!data) return null;
  const withKey = await providersWithKey();
  return toProviderRecord(data as unknown as ProviderRow, withKey.has(id) || envKeyFor(id));
}

/**
 * URL and key used for live calls of ONE provider. The key is stored ENCRYPTED in providers.api_key_encrypted (PROVIDER_KEY_ENC_KEY).
 * Only the first provider (Likeo) may fall back to the environment (LIKEO_API_URL / LIKEO_API_KEY), for a project that has not been
 * bootstrapped. Server only, never returned to a client.
 */
export async function providerCredentials(providerId: string): Promise<{ apiUrl: string; apiKey: string | null; name: string; slug: string } | null> {
  const { data } = await supabaseAdmin().from("providers").select("name,slug,api_url,api_key_encrypted").eq("id", providerId).maybeSingle();
  if (!data) return null;
  const isLikeo = providerId === LIKEO_ID;
  const apiUrl = (isLikeo ? process.env.LIKEO_API_URL?.trim() : "") || data.api_url || (isLikeo ? LIKEO_DEFAULT_URL : "");
  let apiKey: string | null = null;
  if (data.api_key_encrypted) {
    try {
      apiKey = decryptSecret(data.api_key_encrypted, getProviderEncKey());
    } catch {
      apiKey = null; // wrong/missing PROVIDER_KEY_ENC_KEY: Likeo falls back to the environment, loudly in the logs
      console.error(`[provider] kunci provider ${data.slug} tidak bisa didekripsi. PROVIDER_KEY_ENC_KEY berubah?`);
    }
  }
  if (isLikeo) apiKey ??= process.env.LIKEO_API_KEY?.trim() || null;
  return { apiUrl, apiKey, name: data.name, slug: data.slug };
}

/** Kept for the first provider (scripts, older callers). */
export async function likeoCredentials(): Promise<{ apiUrl: string; apiKey: string | null }> {
  const c = await providerCredentials(LIKEO_ID);
  return { apiUrl: c?.apiUrl ?? LIKEO_DEFAULT_URL, apiKey: c?.apiKey ?? null };
}

export async function storeProviderKey(providerId: string, plain: string): Promise<void> {
  const { error } = await supabaseAdmin().from("providers").update({ api_key_encrypted: encryptSecret(plain, getProviderEncKey()) }).eq("id", providerId);
  if (error) throw new Error(`providers: ${error.message}`);
}

/** Adds a provider. The key is encrypted before it is written; nothing about it is returned. */
export async function insertProvider(input: { name: string; slug: string; apiUrl: string; apiKey: string; currency: string; exchangeRate: number | null; active: boolean }): Promise<{ id: string } | { error: "slug_taken" | "failed" }> {
  const { data, error } = await supabaseAdmin().from("providers").insert({
    name: input.name, slug: input.slug, api_url: input.apiUrl, api_key_encrypted: encryptSecret(input.apiKey, getProviderEncKey()), adapter_type: "smm-v2",
    currency: input.currency, exchange_rate: input.exchangeRate, active: input.active, mode: "live",
  }).select("id").single();
  if (error) return { error: error.code === "23505" ? "slug_taken" : "failed" };
  return { id: data.id as string };
}

export async function updateProvider(id: string, patch: Partial<{
  active: boolean; currency: string; exchange_rate: number | null; balance_native: number | null; balance_idr: number | null;
  balance_at: string | null; last_test: unknown; last_sync_at: string; low_balance_threshold: number; mode: string; api_url: string; name: string;
}>): Promise<void> {
  const { error } = await supabaseAdmin().from("providers").update(patch as never).eq("id", id);
  if (error) throw new Error(`providers: ${error.message}`);
}

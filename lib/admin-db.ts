import "server-only";
import { likeoApiUrl } from "@/lib/server/providers/config";
import type { ProviderRecord, PublicProvider } from "@/lib/admin-data";

export function toPublicProvider(p: ProviderRecord): PublicProvider {
  // Explicit allow-list: the API key (in any form, not even its last characters) must never be part of what the client receives.
  return {
    id: p.id,
    name: p.name,
    apiUrl: p.kind === "likeo" ? likeoApiUrl() : p.apiUrl,
    balance: p.balance,
    status: p.status,
    lastSync: p.lastSync,
    kind: p.kind,
    currency: p.currency,
    balanceNative: p.balanceNative,
    balanceAt: p.balanceAt,
    lastTest: p.lastTest,
    slug: p.slug,
    adapterType: p.adapterType,
    exchangeRate: p.exchangeRate ?? null,
    keySaved: Boolean(p.keySaved),
    balanceKnown: Boolean(p.balanceKnown),
    // Write-only field: the UI only learns whether a key exists.
    apiKeyMasked: p.keySaved ? "tersimpan" : "belum diisi",
  };
}

import "server-only";
import { likeoApiUrl, maskedLikeoKey } from "@/lib/server/providers/config";
import type { ProviderRecord, PublicProvider } from "@/lib/admin-data";

/** Shows only the last 4 characters. The full key never leaves the server. */
export function maskKey(key: string): string {
  return `${"•".repeat(12)}${key.slice(-4)}`;
}

export function toPublicProvider(p: ProviderRecord): PublicProvider {
  // Explicit allow-list: the full apiKey must never be part of what the client receives.
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
    // Only the last 4 characters of the key are ever shown.
    apiKeyMasked: p.kind === "likeo" ? maskedLikeoKey() : maskKey(p.apiKey),
  };
}

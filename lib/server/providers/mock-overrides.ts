/**
 * DEV ONLY. A tiny file (".mock-provider.json", git-ignored) through which `npm run dev:simulate` tells the MOCK provider adapter
 * what a given provider order looks like (Partial / Canceled / Failed / Completed), across processes (CLI -> running server).
 * Read only by the mock adapter, i.e. only with PROVIDER_MODE=mock. There is no route, no UI and no live-mode path to it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type MockOverride = { status: string; remains: number; startCount: number; at: number };
export const MOCK_OVERRIDE_FILE = join(process.cwd(), ".mock-provider.json");
/** Entries older than this are ignored: mock order ids (MK-100001...) restart with every server start and must not pick up stale overrides. */
export const MOCK_OVERRIDE_TTL_MS = 6 * 60 * 60 * 1000;

export function readMockOverrides(): Record<string, MockOverride> {
  try {
    if (!existsSync(MOCK_OVERRIDE_FILE)) return {};
    return JSON.parse(readFileSync(MOCK_OVERRIDE_FILE, "utf8")) as Record<string, MockOverride>;
  } catch {
    return {};
  }
}

export function readMockOverride(providerOrderId: string, now = Date.now()): MockOverride | null {
  const o = readMockOverrides()[providerOrderId];
  return o && now - o.at < MOCK_OVERRIDE_TTL_MS ? o : null;
}

export function writeMockOverride(providerOrderId: string, o: Omit<MockOverride, "at">, now = Date.now()): void {
  const all = readMockOverrides();
  for (const [k, v] of Object.entries(all)) if (now - v.at >= MOCK_OVERRIDE_TTL_MS) delete all[k];
  all[providerOrderId] = { ...o, at: now };
  writeFileSync(MOCK_OVERRIDE_FILE, JSON.stringify(all, null, 2));
}

export function clearMockOverrides(): void {
  if (existsSync(MOCK_OVERRIDE_FILE)) writeFileSync(MOCK_OVERRIDE_FILE, "{}");
}

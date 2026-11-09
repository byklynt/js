/**
 * Likeo adapter. Likeo speaks the standard SMM-panel "API v2", so this is the generic adapter (smm-v2.ts) with Likeo's name on the messages.
 * Kept as its own module so existing imports (and tests) keep working; new providers use createSmmV2Adapter directly.
 */
import { createSmmV2Adapter, type SmmV2Options } from "./smm-v2";
import type { ProviderAdapter } from "./types";

export {
  READ_RETRIES, REQUEST_TIMEOUT_MS, cancelStateFromStatus, mapRefillStatus, mapSmmStatus as mapLikeoStatus, mapSmmStatus, translateProviderError,
} from "./smm-v2";

export type LikeoOptions = SmmV2Options;

export function createLikeoAdapter(opts: LikeoOptions): ProviderAdapter {
  return createSmmV2Adapter({ ...opts, providerName: opts.providerName ?? "Likeo" });
}

import "server-only";
import { checkAllProviders } from "./balance";

/**
 * Reads the balance of every active provider whose cached reading is older than 60 seconds. Never throws. In live mode a failure is NOT hidden:
 * it is stored as the last test result and shown on that provider's card; the mock is never used instead. One provider failing does not affect the others.
 */
export async function ensureFreshBalance(): Promise<void> {
  try {
    await checkAllProviders();
  } catch {
    /* each provider records its own failure; anything else must not break the page */
  }
}

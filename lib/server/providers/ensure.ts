import type { AdminDb } from "@/lib/admin-data";
import { persistAdminState } from "../store";
import { checkLikeo } from "./balance";

/**
 * Reads the Likeo balance if the cached one is older than 60 seconds. Never throws. In live mode a failure is NOT hidden:
 * it is stored as the last test result and shown on the provider card; the mock is never used instead.
 */
export async function ensureFreshBalance(db: AdminDb): Promise<void> {
  try {
    await checkLikeo(db);
    persistAdminState(db);
  } catch {
    /* checkLikeo records its own failures; anything else must not break the page */
  }
}

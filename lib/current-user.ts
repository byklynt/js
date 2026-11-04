import "server-only";
import { getCurrentUser } from "@/lib/auth-actions";
import { getDb } from "@/lib/admin-db";

/**
 * The signed-in user's ID, resolved on the server. No user ID is ever accepted from the client.
 * TODO(auth): getCurrentUser() is a mock today; replace it with the real session lookup.
 */
export async function currentUserId(): Promise<string | null> {
  const me = await getCurrentUser();
  if (!me) return null;
  return getDb().users.find((u) => u.username === me.username)?.id ?? null;
}

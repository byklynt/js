import "server-only";
import { getCurrentUser } from "@/lib/auth-actions";

/** The signed-in user's ID, resolved on the server from the signed session cookie. No user ID is ever accepted from the client. */
export async function currentUserId(): Promise<string | null> {
  return (await getCurrentUser())?.id ?? null;
}

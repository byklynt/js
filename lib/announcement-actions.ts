"use server";

import { currentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/admin-db";
import { markSeen, unseenCount } from "@/lib/server/announcements";
import { persistAdminState } from "@/lib/server/store";

/** Sidebar badge on "Pembaruan": announcements the signed-in user has not seen yet. */
export async function getUnseenUpdatesCountAction(): Promise<number> {
  const userId = await currentUserId();
  return userId ? unseenCount(getDb(), userId) : 0;
}

/** Called when /dashboard/updates opens. TODO(db): table announcement_seen(user_id, last_seen_at). */
export async function markUpdatesSeenAction(): Promise<number> {
  const userId = await currentUserId();
  if (!userId) return 0;
  const db = getDb();
  markSeen(db, userId);
  persistAdminState(db);
  return unseenCount(db, userId);
}

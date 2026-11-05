"use server";

import { currentUserId } from "@/lib/current-user";
import { markSeen, unseenCount } from "@/lib/server/repo/announcements";

/** Sidebar badge on "Pembaruan": announcements the signed-in user has not seen yet. */
export async function getUnseenUpdatesCountAction(): Promise<number> {
  const userId = await currentUserId();
  return userId ? unseenCount(userId) : 0;
}

/** Called when /dashboard/updates opens (table announcement_reads). */
export async function markUpdatesSeenAction(): Promise<number> {
  const userId = await currentUserId();
  if (!userId) return 0;
  await markSeen(userId);
  return unseenCount(userId);
}

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { COMMUNITY_TAG, sanitizeCommunityLinks, type CommunityLinks } from "@/lib/community-links";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

/**
 * The community links for the user side (sidebar, footers). Read from the site settings, validated again before use, and cached:
 * revalidated at most every minute, and immediately when an admin saves (updateTag on the tag). Never throws: a failed read hides the links.
 */
export async function getCommunityLinks(): Promise<CommunityLinks> {
  "use cache";
  cacheTag(COMMUNITY_TAG);
  cacheLife({ stale: 30, revalidate: 60, expire: 3600 });
  try {
    const { data } = await supabaseAdmin().from("site_settings").select("data").maybeSingle();
    return sanitizeCommunityLinks((data?.data as { community?: unknown } | null)?.community);
  } catch {
    return sanitizeCommunityLinks({});
  }
}

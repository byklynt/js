import { LegalFooter } from "@/components/legal/legal-footer";
import { getCommunityLinks } from "@/lib/server/community";

/** LegalFooter for server-rendered pages: the community links come from the (cached) site settings. */
export async function CommunityLegalFooter() {
  return <LegalFooter community={await getCommunityLinks()} />;
}

import Link from "next/link";
import { LEGAL_PATHS } from "@/lib/legal-content";
import { activeCommunityLinks, EMPTY_COMMUNITY, type CommunityLinks } from "@/lib/community-links";

export const legalLinks = [
  { label: "Syarat & Ketentuan", href: LEGAL_PATHS.terms },
  { label: "Kebijakan Refund", href: LEGAL_PATHS.refund },
  { label: "Kebijakan Privasi", href: LEGAL_PATHS.privacy },
];

/** Footer of the legal pages and the dashboard. Community links (when set) follow the legal links in the same row. */
export function LegalFooter({ community = EMPTY_COMMUNITY }: { community?: CommunityLinks } = {}) {
  const channels = activeCommunityLinks(community);
  return (
    <footer className="border-t border-primary-100 px-4 py-6 dark:border-slate-800">
      <nav aria-label="Tautan hukum" className="mx-auto flex max-w-3xl flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
        {legalLinks.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-primary-500">
            {l.label}
          </Link>
        ))}
        {channels.map((c) => (
          <a key={c.key} href={c.href} target="_blank" rel="noopener noreferrer" data-testid="footer-community" className="hover:text-primary-500">
            {c.label}
          </a>
        ))}
        <span>&copy; 2026 JagoanSosmed</span>
      </nav>
    </footer>
  );
}

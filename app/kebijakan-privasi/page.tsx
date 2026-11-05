import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";
import { PRIVACY } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: `${PRIVACY.title} - JagoanSosmed`,
  description: PRIVACY.description,
  alternates: { canonical: `/${PRIVACY.slug}` },
};

export default function Page() {
  return <LegalLayout doc={PRIVACY} />;
}

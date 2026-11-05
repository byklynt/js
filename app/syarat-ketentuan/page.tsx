import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";
import { TERMS } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: `${TERMS.title} - JagoanSosmed`,
  description: TERMS.description,
  alternates: { canonical: `/${TERMS.slug}` },
};

export default function Page() {
  return <LegalLayout doc={TERMS} />;
}

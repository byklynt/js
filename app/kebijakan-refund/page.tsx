import type { Metadata } from "next";
import { LegalLayout } from "@/components/legal/legal-layout";
import { REFUND } from "@/lib/legal-content";

export const metadata: Metadata = {
  title: `${REFUND.title} - JagoanSosmed`,
  description: REFUND.description,
  alternates: { canonical: `/${REFUND.slug}` },
};

export default function Page() {
  return <LegalLayout doc={REFUND} />;
}

import type { Metadata } from "next";
import { Users } from "lucide-react";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";

export const metadata: Metadata = { title: "Afiliasi - JagoanSosmed" };

/** The referral program (links, commission, payouts) is not built yet: see lib/features.ts. */
export default function Page() {
  return <EmptyStateCard icon={Users} title="Afiliasi" description="Program afiliasi (tautan referral, komisi, dan penarikan) belum tersedia." />;
}

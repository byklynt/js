import type { Metadata } from "next";
import { Globe } from "lucide-react";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";

export const metadata: Metadata = { title: "Panel Anak - JagoanSosmed" };

export default function ChildPanelPage() {
  return <EmptyStateCard icon={Globe} title="Panel Anak" />;
}

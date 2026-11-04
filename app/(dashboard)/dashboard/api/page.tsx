import type { Metadata } from "next";
import { Code2 } from "lucide-react";
import { EmptyStateCard } from "@/components/dashboard/empty-state-card";

export const metadata: Metadata = { title: "API - JagoanSosmed" };

export default function ApiPage() {
  return <EmptyStateCard icon={Code2} title="API" />;
}

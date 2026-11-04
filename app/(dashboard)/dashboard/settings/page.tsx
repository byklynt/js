import type { Metadata } from "next";
import { SecurityForm } from "@/components/settings/security-form";

export const metadata: Metadata = { title: "Pengaturan - JagoanSosmed" };

export default function Page() {
  return <SecurityForm />;
}

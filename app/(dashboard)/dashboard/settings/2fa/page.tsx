import type { Metadata } from "next";
import { TwoFactor } from "@/components/settings/two-factor";

export const metadata: Metadata = { title: "Pengaturan - JagoanSosmed" };

export default function Page() {
  return <TwoFactor />;
}

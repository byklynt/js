import type { Metadata } from "next";
import { TimezoneApi } from "@/components/settings/timezone-api";

export const metadata: Metadata = { title: "Pengaturan - JagoanSosmed" };

export default function Page() {
  return <TimezoneApi />;
}

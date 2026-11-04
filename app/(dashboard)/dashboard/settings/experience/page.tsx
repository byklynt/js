import type { Metadata } from "next";
import { ExperienceForm } from "@/components/settings/experience-form";

export const metadata: Metadata = { title: "Pengaturan - JagoanSosmed" };

export default function Page() {
  return <ExperienceForm />;
}

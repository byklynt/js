import type { Metadata } from "next";
import { NotificationsForm } from "@/components/settings/notifications-form";

export const metadata: Metadata = { title: "Pengaturan - JagoanSosmed" };

export default function Page() {
  return <NotificationsForm />;
}

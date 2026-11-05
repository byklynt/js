import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { AnnouncementsView } from "@/components/admin/announcements/announcements-view";
import { audienceCount, listAnnouncements } from "@/lib/server/repo/announcements";

export const metadata: Metadata = { title: "Pengumuman - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        // Placeholder reach: how many active accounts match each audience.
        const counts = { semua: await audienceCount("semua"), reseller: await audienceCount("reseller") };
        return <AnnouncementsView announcements={await listAnnouncements()} counts={counts} />;
      }}
    </AdminData>
  );
}

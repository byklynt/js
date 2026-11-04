import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { AnnouncementsView } from "@/components/admin/announcements/announcements-view";
import { getDb } from "@/lib/admin-db";
import { audienceCount } from "@/lib/server/announcements";

export const metadata: Metadata = { title: "Pengumuman - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {() => {
        const db = getDb();
        // Placeholder reach: how many active accounts match each audience.
        const counts = { semua: audienceCount(db, "semua"), reseller: audienceCount(db, "reseller") };
        return <AnnouncementsView announcements={db.announcements} counts={counts} />;
      }}
    </AdminData>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { UpdatesPage } from "@/components/updates/updates-page";
import { getDb } from "@/lib/admin-db";
import type { ServiceUpdate } from "@/lib/updates-data";
import { currentUserId } from "@/lib/current-user";
import { getVisibleAnnouncements, viewerOf } from "@/lib/server/announcements";

export const metadata: Metadata = { title: "Pembaruan - JagoanSosmed" };

export default function Page() {
  return (
    <Suspense fallback={<UpdatesPage />}>
      <UpdatesWithAdminChanges />
    </Suspense>
  );
}

/** Price/service changes made in the admin area show up here as extra updates. */
async function UpdatesWithAdminChanges() {
  await connection();
  const extra: ServiceUpdate[] = getDb().priceUpdates.map((u) => ({
    id: u.id, serviceId: u.serviceId, platform: u.platform, name: u.name, type: u.type, date: u.date, detail: u.detail,
  }));
  // Announcements for this user, filtered on the server (hidden ones never reach the browser).
  const db = getDb();
  const userId = await currentUserId();
  const viewer = userId ? viewerOf(db, userId) : null;
  const announcements: ServiceUpdate[] = viewer
    ? getVisibleAnnouncements(db, { user: viewer, placement: "pembaruan" }).map((a) => ({
        id: `ann-${a.id}`, serviceId: "", platform: "", name: a.title, type: "pengumuman", date: a.publishAt.slice(0, 10), detail: a.body,
        announcement: { body: a.body, level: a.level, publishAt: a.publishAt },
      }))
    : [];
  return <UpdatesPage extra={extra} announcements={announcements} />;
}

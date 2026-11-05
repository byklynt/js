import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { UpdatesPage } from "@/components/updates/updates-page";
import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { ServiceUpdate } from "@/lib/updates-data";
import { currentUserId } from "@/lib/current-user";
import { getVisibleAnnouncements, viewerOf } from "@/lib/server/repo/announcements";

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
  const { data: changes } = await supabaseAdmin().from("price_updates").select("*").order("created_at", { ascending: false }).limit(100);
  const extra: ServiceUpdate[] = (changes ?? []).map((u) => ({
    id: u.id, serviceId: u.service_id, platform: u.platform, name: u.name, type: u.type as ServiceUpdate["type"], date: u.created_at.slice(0, 10), detail: u.detail,
  }));
  // Announcements for this user, filtered on the server (hidden ones never reach the browser).
  const userId = await currentUserId();
  const viewer = userId ? await viewerOf(userId) : null;
  const announcements: ServiceUpdate[] = viewer
    ? (await getVisibleAnnouncements({ user: viewer, placement: "pembaruan" })).map((a) => ({
        id: `ann-${a.id}`, serviceId: "", platform: "", name: a.title, type: "pengumuman", date: a.publishAt.slice(0, 10), detail: a.body,
        announcement: { body: a.body, level: a.level, publishAt: a.publishAt },
      }))
    : [];
  return <UpdatesPage extra={extra} announcements={announcements} />;
}

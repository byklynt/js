import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth-actions";
import { DashboardHome } from "@/components/dashboard/dashboard-home";
import { currentUserId } from "@/lib/current-user";
import { getDb } from "@/lib/admin-db";
import { getMyStats } from "@/lib/user-actions";
import { getOrderBootstrap } from "@/lib/server/services";
import { getVisibleAnnouncements, viewerOf } from "@/lib/server/announcements";

export const metadata: Metadata = { title: "Dashboard - JagoanSosmed" };

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const user = await getCurrentUser();
  const username = user?.username ?? "Pengguna";

  return (
    <Suspense fallback={<DashboardHome username={username} hasServices />}>
      <DashboardPageContent username={username} searchParams={props.searchParams} />
    </Suspense>
  );
}

async function DashboardPageContent({
  username,
  searchParams,
}: {
  username: string;
  searchParams: PageProps<"/dashboard">["searchParams"];
}) {
  // Announcements depend on the current time and on who is signed in: always render per request.
  await connection();
  const params = await searchParams;
  const serviceParam = params.service;
  const preselectServiceId = Array.isArray(serviceParam) ? serviceParam[0] : serviceParam;

  // Filtered on the server: only announcements this user is allowed to see are sent to the browser.
  const db = getDb();
  const userId = await currentUserId();
  const viewer = userId ? viewerOf(db, userId) : null;
  const announcements = viewer ? getVisibleAnnouncements(db, { user: viewer, placement: "dashboard" }) : [];

  // Only the order page's first needs: whether any service exists and the ?service=ID one. The catalogue itself is never sent.
  const { hasServices, preselect } = getOrderBootstrap(db, preselectServiceId);
  return <DashboardHome username={username} preselect={preselect} hasServices={hasServices} announcements={announcements} stats={await getMyStats()} />;
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { TimezoneApi } from "@/components/settings/timezone-api";
import { getMySettings } from "@/lib/user-actions";

export const metadata: Metadata = { title: "Pengaturan - JagoanSosmed" };

export default function Page() {
  return (
    <Suspense fallback={<TimezoneApi />}>
      <Loaded />
    </Suspense>
  );
}

async function Loaded() {
  await connection();
  const saved = await getMySettings("timezone");
  return <TimezoneApi initialTimezone={typeof saved.timezone === "string" ? saved.timezone : undefined} />;
}

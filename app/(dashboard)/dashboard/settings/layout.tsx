import { Suspense } from "react";
import { connection } from "next/server";
import { SettingsShell } from "@/components/settings/settings-shell";
import { getMyStats } from "@/lib/user-actions";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<SettingsShell>{children}</SettingsShell>}>
      <WithRank>{children}</WithRank>
    </Suspense>
  );
}

async function WithRank({ children }: { children: React.ReactNode }) {
  await connection();
  const { rank } = await getMyStats();
  return <SettingsShell badge={rank}>{children}</SettingsShell>;
}

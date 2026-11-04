import { dashboardCopy } from "@/lib/dashboard-data";

export function WelcomeHeader({ username }: { username: string }) {
  return (
    <div>
      <h1 className="text-[26px] font-semibold tracking-[-0.015em] text-ink dark:text-white">
        {dashboardCopy.welcomeTitle} <span className="text-primary-accent">{username}</span>{" "}
        <span aria-hidden>👋</span>
      </h1>
      <p className="mt-1.5 max-w-md text-[10px] font-medium text-[#5B6B8C] dark:text-slate-400">
        {dashboardCopy.welcomeSubtitle}
      </p>
    </div>
  );
}

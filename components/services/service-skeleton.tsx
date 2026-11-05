export function ServiceSkeleton({ groups = 3, cards = 2 }: { groups?: number; cards?: number }) {
  return (
    <div className="space-y-6" aria-hidden>
      {Array.from({ length: groups }).map((_, groupIndex) => (
        <div key={groupIndex} className="space-y-3">
          {groups > 1 ? <div className="h-10 w-full animate-shimmer rounded-xl" /> : null}
          <div className="space-y-3">
            {Array.from({ length: cards }).map((_, cardIndex) => (
              <div
                key={cardIndex}
                className="rounded-2xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="h-5 w-64 animate-shimmer rounded-lg" />
                  <div className="h-8 w-28 animate-shimmer rounded-lg" />
                </div>
                <div className="mt-4 h-px w-full bg-slate-100 dark:bg-slate-800" />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="h-8 w-56 animate-shimmer rounded-lg" />
                  <div className="h-9 w-40 animate-shimmer rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

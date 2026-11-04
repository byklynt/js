/** Soft gradient + square pattern behind the top-right of the page header. */
export function HeaderZone() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 -top-[67px] -z-10 h-[262px] overflow-hidden bg-[radial-gradient(ellipse_at_top_right,var(--primary-50),#ffffff_70%)] dark:bg-none"
    >
      <div className="bg-squares absolute -top-4 right-0 h-[300px] w-[46%] [mask-image:linear-gradient(to_left,black_10%,transparent_95%),linear-gradient(to_bottom,black_45%,transparent)] [mask-composite:intersect] [-webkit-mask-composite:source-in]" />
    </div>
  );
}

/**
 * 1px full-bleed rule. Position it with `top` (px or CSS length) inside a relatively
 * positioned wrapper; the default sits 54px below the wrapper top (behind stat cards).
 */
export function HeaderLine({ className, top = 54 }: { className?: string; top?: number | string }) {
  return (
    <div
      aria-hidden
      style={{ top }}
      className={`pointer-events-none absolute -inset-x-4 z-0 h-px bg-slate-200/70 sm:-inset-x-6 lg:-inset-x-[53px] dark:bg-slate-800 ${className ?? ""}`}
    />
  );
}

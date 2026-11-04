"use client";

/** Sticky bottom bar shown while rows are selected (dummy actions only). */
export function SelectionBar({
  count,
  onCopyIds,
  onClear,
}: {
  count: number;
  onCopyIds: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Aksi item terpilih"
      className="sticky bottom-4 z-20 mx-auto mt-5 flex w-fit items-center gap-3 rounded-full border border-slate-200/70 bg-white py-2 pr-2 pl-4 shadow-lg dark:border-slate-700 dark:bg-slate-900"
    >
      <span className="text-[10.5px] font-semibold text-ink dark:text-white">{count} dipilih</span>
      <button
        type="button"
        onClick={onCopyIds}
        className="h-8 rounded-full border border-slate-200 px-3.5 text-[10px] font-medium text-ink transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
      >
        Salin ID
      </button>
      <button
        type="button"
        onClick={onClear}
        className="h-8 rounded-full bg-primary-solid px-3.5 text-[10px] font-semibold text-white transition hover:brightness-105"
      >
        Batal pilih
      </button>
    </div>
  );
}

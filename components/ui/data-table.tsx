"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Extra classes for the cell (e.g. "text-right", "w-40"). */
  className?: string;
  /** Hide this column below the lg breakpoint (still shown on the mobile card via mobileCard). */
  hideBelowLg?: boolean;
  /** Makes the header a sort button. The parent sorts the rows. */
  sortable?: boolean;
};

/**
 * Dense desktop table (row h-12, 1px dividers, rounded-2xl card, sticky header, horizontal scroll)
 * that collapses into stacked row cards under 768px.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  mobileCard,
  ariaLabel,
  selection,
  sort,
  onSort,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Mobile (<768px) representation of one row. Rendered inside an <li>. */
  mobileCard: (row: T) => React.ReactNode;
  ariaLabel: string;
  sort?: { key: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  selection?: {
    selected: Set<string>;
    onToggle: (id: string) => void;
    onToggleAll: (ids: string[], checked: boolean) => void;
    label: (row: T) => string;
  };
}) {
  const allIds = rows.map(rowKey);
  const allSelected = selection ? allIds.length > 0 && allIds.every((id) => selection.selected.has(id)) : false;

  return (
    <>
      <div className="thin-scroll relative hidden max-h-[calc(100vh-240px)] overflow-auto rounded-2xl border border-slate-200/70 bg-white md:block dark:border-slate-800 dark:bg-slate-900">
        <table aria-label={ariaLabel} className="w-full border-collapse text-left">
          <thead>
            <tr>
              {selection ? (
                <th scope="col" className="sticky top-0 z-10 w-10 border-b border-slate-200/70 bg-white pl-4 dark:border-slate-800 dark:bg-slate-900">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(e) => selection.onToggleAll(allIds, e.target.checked)}
                    aria-label="Pilih semua baris"
                    className="h-4 w-4 cursor-pointer accent-primary"
                  />
                </th>
              ) : null}
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? (sort?.key === col.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none") : undefined}
                  className={cn(
                    "sticky top-0 z-10 h-10 border-b border-slate-200/70 bg-white px-4 text-[10px] font-semibold whitespace-nowrap text-[#5B6B8C] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400",
                    col.hideBelowLg && "max-lg:hidden",
                    col.className
                  )}
                >
                  {col.sortable && onSort ? (
                    <button
                      type="button"
                      onClick={() => onSort(col.key)}
                      className="inline-flex items-center gap-1 rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {col.header}
                      <span aria-hidden className="text-[8px]">{sort?.key === col.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const id = rowKey(row);
              return (
                <motion.tr
                  key={id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i, 10) * 0.02 }}
                  className={cn(
                    "border-b border-slate-200/70 last:border-b-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-white/[0.03]",
                    selection?.selected.has(id) && "bg-primary-50/50 dark:bg-primary-soft"
                  )}
                >
                  {selection ? (
                    <td className="h-12 w-10 pl-4">
                      <input
                        type="checkbox"
                        checked={selection.selected.has(id)}
                        onChange={() => selection.onToggle(id)}
                        aria-label={selection.label(row)}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </td>
                  ) : null}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        "h-12 px-4 text-[10.5px] text-ink dark:text-slate-100",
                        col.hideBelowLg && "max-lg:hidden",
                        col.className
                      )}
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul aria-label={ariaLabel} className="space-y-3 md:hidden">
        {rows.map((row, i) => (
          <motion.li
            key={rowKey(row)}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i, 8) * 0.03 }}
            className="list-none rounded-2xl border border-slate-200/70 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
          >
            {mobileCard(row)}
          </motion.li>
        ))}
      </ul>
    </>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { formatIdr } from "@/lib/balance";

type Item = { id: string; name: string; categoryId: string; price: number; min: number; max: number; refill: boolean };
type Cat = { id: string; label: string };

const PAGE = 100;

export function ServicesList({ categories, items }: { categories: Cat[]; items: Item[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const [limit, setLimit] = useState(PAGE);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((s) => (!cat || s.categoryId === cat) && (!needle || s.name.toLowerCase().includes(needle)));
  }, [items, q, cat]);

  if (items.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-primary-200 px-6 py-16 text-center dark:border-slate-700">
        <p className="text-base font-semibold text-slate-900 dark:text-white">Belum ada layanan</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Daftar layanan akan tampil di sini setelah tersedia.</p>
        <SignupButton />
      </div>
    );
  }

  const catLabel = new Map(categories.map((c) => [c.id, c.label]));
  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Cari layanan</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Cari layanan..."
            className="w-full rounded-full border border-primary-100 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          />
        </label>
        <label>
          <span className="sr-only">Kategori</span>
          <select
            value={cat}
            onChange={(e) => {
              setCat(e.target.value);
              setLimit(PAGE);
            }}
            className="w-full rounded-full border border-primary-100 bg-white px-4 py-2.5 text-sm outline-none focus:border-primary-400 sm:w-72 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <SignupButton compact />
      </div>

      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400" role="status">
        {filtered.length} layanan
      </p>

      {filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-500 dark:text-slate-400">Tidak ada layanan yang cocok.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-3xl border border-primary-100 dark:border-slate-800">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <tr>
                <th className="px-4 py-3">Layanan</th>
                <th className="px-4 py-3 text-right">Harga / 1000</th>
                <th className="px-4 py-3 text-right">Min - Maks</th>
                <th className="px-4 py-3">Refill</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((s) => (
                <tr key={s.id} className="border-t border-primary-100/70 dark:border-slate-800">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-900 dark:text-white">{s.name}</p>
                    <p className="text-xs text-slate-400">{catLabel.get(s.categoryId) ?? ""}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-700 dark:text-slate-200">{formatIdr(s.price)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                    {s.min.toLocaleString("id-ID")} - {s.max.toLocaleString("id-ID")}
                  </td>
                  <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{s.refill ? "Ya" : "Tidak"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > limit ? (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => setLimit((l) => l + PAGE)}
            className="rounded-full border border-primary-200 px-5 py-2 text-sm font-semibold text-primary-600 hover:bg-primary-50 dark:border-slate-700 dark:text-primary-300 dark:hover:bg-slate-800"
          >
            Tampilkan lebih banyak
          </button>
        </div>
      ) : null}
    </div>
  );
}

function SignupButton({ compact }: { compact?: boolean }) {
  return (
    <Link
      href="/signup"
      className={`inline-flex items-center justify-center rounded-full bg-primary-solid px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-500/30 transition hover:bg-primary-600 ${compact ? "" : "mt-6"}`}
    >
      Daftar untuk memesan
    </Link>
  );
}

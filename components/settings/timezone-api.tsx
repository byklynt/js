"use client";

import { useId, useMemo, useState } from "react";
import { Check, Clock, Code2 } from "lucide-react";
import { timezones } from "@/lib/settings-data";
import { saveSettings } from "@/lib/dashboard-actions";
import { useToast } from "@/components/shared/toast";
import { cn } from "@/lib/utils";
import { SettingsPageHeader, SettingsSection } from "./settings-parts";

function TimezoneSection({ initial }: { initial: string }) {
  const toast = useToast();
  const searchId = useId();
  const [selected, setSelected] = useState(initial);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? timezones.filter((t) => t.label.toLowerCase().includes(q)) : timezones;
  }, [query]);

  async function choose(id: string) {
    setSelected(id);
    try {
      await saveSettings("timezone", { timezone: id });
      toast(`Zona waktu diubah ke ${id}`);
    } catch {
      toast("Gagal menyimpan zona waktu.", "error");
    }
  }

  return (
    <SettingsSection icon={Clock} title="Zona waktu">
      <div className="max-w-[520px]">
        <label htmlFor={searchId} className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
          Cari zona waktu
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Contoh: Jakarta"
          className="h-[34px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[10px] text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-600"
        />
        <ul
          role="listbox"
          aria-label="Zona waktu"
          className="thin-scroll mt-2 max-h-48 overflow-y-auto rounded-xl border border-slate-200/70 p-1 dark:border-slate-800"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-4 text-center text-[10px] text-[#5B6B8C] dark:text-slate-400">
              Zona waktu tidak ditemukan.
            </li>
          ) : (
            filtered.map((t) => {
              const active = t.id === selected;
              return (
                <li key={t.id} role="option" aria-selected={active}>
                  <button
                    type="button"
                    onClick={() => choose(t.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-[10.5px] transition focus-visible:outline-2 focus-visible:outline-primary",
                      active
                        ? "bg-primary-50 font-medium text-primary-accent dark:bg-primary-soft"
                        : "text-ink hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                    )}
                  >
                    {t.label}
                    {active ? <Check className="h-3.5 w-3.5" aria-hidden /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </SettingsSection>
  );
}

function ApiSection() {
  return (
    <SettingsSection icon={Code2} title="API">
      <p role="status" className="max-w-[520px] rounded-xl border border-dashed border-slate-300 px-4 py-3 text-[10.5px] text-[#5B6B8C] dark:border-slate-700 dark:text-slate-400">
        API untuk pelanggan belum tersedia. Pembuatan API key akan dibuka setelah API-nya siap.
      </p>
    </SettingsSection>
  );
}

export function TimezoneApi({ initialTimezone = "Asia/Jakarta" }: { initialTimezone?: string }) {
  return (
    <>
      <SettingsPageHeader title="Zona Waktu" subtitle="Atur zona waktu akunmu." />
      <TimezoneSection initial={initialTimezone} />
      <ApiSection />
    </>
  );
}

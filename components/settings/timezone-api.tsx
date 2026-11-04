"use client";

import { useId, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Clock, Code2, Copy, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { initialApiKey, timezones } from "@/lib/settings-data";
import { regenerateApiKey, saveSettings } from "@/lib/dashboard-actions";
import { useToast } from "@/components/shared/toast";
import { Dialog } from "@/components/ui/dialog";
import { outlineButtonClass, primaryButtonClass } from "@/components/ui/text-field";
import { cn } from "@/lib/utils";
import { SettingsPageHeader, SettingsSection } from "./settings-parts";

function TimezoneSection() {
  const toast = useToast();
  const searchId = useId();
  const [selected, setSelected] = useState("Asia/Jakarta");
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
  const toast = useToast();
  const keyId = useId();
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [visible, setVisible] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const masked = `${apiKey.slice(0, 8)}${"•".repeat(24)}`;

  async function copyKey() {
    try {
      await navigator.clipboard.writeText(apiKey);
      toast("API key disalin");
    } catch {
      toast("Gagal menyalin API key", "error");
    }
  }

  async function handleRegenerate() {
    setBusy(true);
    try {
      const result = await regenerateApiKey();
      setApiKey(result.key);
      setVisible(true);
      setConfirmOpen(false);
      toast("API key baru berhasil dibuat");
    } catch {
      toast("Gagal membuat ulang API key.", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsSection icon={Code2} title="API key">
      <div className="max-w-[520px]">
        <label htmlFor={keyId} className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
          API key
        </label>
        <div className="flex items-center gap-2">
          <input
            id={keyId}
            readOnly
            value={visible ? apiKey : masked}
            className="h-[34px] min-w-0 flex-1 rounded-xl border border-slate-200 bg-[#F1F6FB] px-3.5 font-mono text-[10px] text-ink outline-none dark:border-slate-700 dark:bg-[#161b20] dark:text-white"
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? "Sembunyikan API key" : "Tampilkan API key"}
            aria-pressed={visible}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl border border-slate-200 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={copyKey}
            aria-label="Salin API key"
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl border border-slate-200 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setConfirmOpen(true)} className={outlineButtonClass}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            Buat ulang key
          </button>
          <Link
            href="/dashboard/api"
            className="rounded text-[10px] font-medium text-primary-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Lihat dokumentasi API
          </Link>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Buat ulang API key?"
        description="Key lama langsung tidak berlaku. Semua integrasi yang memakainya perlu diperbarui."
        maxWidth="max-w-sm"
      >
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmOpen(false)} className={outlineButtonClass}>
            Batal
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={handleRegenerate}
            className={cn(primaryButtonClass, "h-9 w-auto px-5")}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Ya, buat ulang
          </button>
        </div>
      </Dialog>
    </SettingsSection>
  );
}

export function TimezoneApi() {
  return (
    <>
      <SettingsPageHeader title="Zona Waktu & API" subtitle="Atur zona waktu dan kelola API key-mu." />
      <TimezoneSection />
      <ApiSection />
    </>
  );
}

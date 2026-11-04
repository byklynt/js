"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { Languages, Palette, SlidersHorizontal } from "lucide-react";
import { languages } from "@/lib/settings-data";
import { useLanguage } from "@/lib/i18n/provider";
import type { Lang } from "@/lib/i18n";
import { saveSettings } from "@/lib/dashboard-actions";
import { useIsMounted } from "@/lib/use-is-mounted";
import { useToast } from "@/components/shared/toast";
import { CustomSelect } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { SettingsPageHeader, SettingsSection } from "./settings-parts";

type ThemeValue = "light" | "dark" | "system";
const themeItems: { value: ThemeValue; label: string }[] = [
  { value: "light", label: "Terang" },
  { value: "dark", label: "Gelap" },
  { value: "system", label: "Otomatis" },
];

export function ExperienceForm() {
  const toast = useToast();
  const mounted = useIsMounted();
  const { theme, setTheme } = useTheme();
  const { lang, setLanguage, t } = useLanguage();
  const language = languages.find((l) => l.id === lang) ?? languages[0];
  const [compact, setCompact] = useState(false);

  const currentTheme: ThemeValue = mounted && (theme === "dark" || theme === "system") ? theme : "light";

  async function persist(values: Record<string, unknown>, message: string) {
    try {
      await saveSettings("experience", values);
      toast(message);
    } catch {
      toast("Gagal menyimpan pengaturan.", "error");
    }
  }

  return (
    <>
      <SettingsPageHeader title="Pengalaman Pengguna" subtitle="Sesuaikan tampilan dan bahasa dashboard-mu." />

      <SettingsSection icon={Palette} title="Tema">
        <p className="mb-3 text-[10px] text-[#5B6B8C] dark:text-slate-400">
          Pilih tampilan dashboard. &quot;Otomatis&quot; mengikuti pengaturan perangkatmu.
        </p>
        <SegmentedControl<ThemeValue>
          items={themeItems}
          value={currentTheme}
          onChange={(next) => {
            setTheme(next);
            persist({ theme: next }, "Tema diperbarui");
          }}
          ariaLabel="Tema tampilan"
          className="max-w-[420px]"
        />
      </SettingsSection>

      <SettingsSection icon={Languages} title="Bahasa">
        <div className="max-w-[420px]">
          <CustomSelect
            label="Bahasa tampilan"
            options={languages}
            value={language}
            onChange={(next) => {
              // Same provider as the globe in the topbar: cookie + profile + refresh.
              setLanguage(next.id as Lang);
              toast(t("lang.changed"));
            }}
            getKey={(l) => l.id}
            renderOption={(l) => l.label}
            renderValue={(l) => l.label}
            placeholder="Pilih bahasa"
          />
        </div>
      </SettingsSection>

      <SettingsSection icon={SlidersHorizontal} title="Tampilan">
        <div className="flex max-w-[420px] items-center justify-between gap-4 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
          <div>
            <p className="text-[10.5px] font-semibold text-ink dark:text-white">Mode ringkas</p>
            <p className="mt-0.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">
              Kurangi jarak antar elemen agar lebih banyak data terlihat.
            </p>
          </div>
          <ToggleSwitch
            checked={compact}
            label="Mode ringkas"
            onChange={(next) => {
              setCompact(next);
              persist({ compact: next }, next ? "Mode ringkas aktif" : "Mode ringkas nonaktif");
            }}
          />
        </div>
      </SettingsSection>
    </>
  );
}

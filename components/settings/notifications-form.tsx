"use client";

import { useState } from "react";
import { Bell, Send } from "lucide-react";
import { notificationChannels, notificationEvents } from "@/lib/settings-data";
import { saveSettings } from "@/lib/dashboard-actions";
import { useToast } from "@/components/shared/toast";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { SettingsPageHeader, SettingsSection } from "./settings-parts";

type Prefs = {
  events: Record<string, boolean>;
  channels: Record<string, boolean>;
};

const initial: Prefs = {
  events: { orderDone: true, ticketReply: true, serviceUpdate: false, promo: false },
  channels: { email: true, telegram: false, whatsapp: false },
};

function Row({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <p className="text-[10.5px] font-semibold text-ink dark:text-white">{label}</p>
        {hint ? <p className="mt-0.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">{hint}</p> : null}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} label={label} />
    </li>
  );
}

export function NotificationsForm() {
  const toast = useToast();
  const [prefs, setPrefs] = useState<Prefs>(initial);

  // Auto-save: every toggle persists immediately and confirms with a toast.
  async function update(group: keyof Prefs, id: string, value: boolean) {
    const next: Prefs = { ...prefs, [group]: { ...prefs[group], [id]: value } };
    setPrefs(next);
    try {
      await saveSettings("notifications", next);
      toast("Pengaturan notifikasi disimpan");
    } catch {
      toast("Gagal menyimpan pengaturan notifikasi.", "error");
    }
  }

  return (
    <>
      <SettingsPageHeader title="Notifikasi" subtitle="Pilih kabar apa saja dan lewat mana kamu ingin menerimanya." />

      <SettingsSection icon={Bell} title="Jenis notifikasi">
        <ul className="max-w-[720px] divide-y divide-slate-200/70 dark:divide-slate-800">
          {notificationEvents.map((e) => (
            <Row
              key={e.id}
              label={e.label}
              hint={e.hint}
              checked={prefs.events[e.id]}
              onChange={(v) => update("events", e.id, v)}
            />
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection icon={Send} title="Saluran">
        <ul className="max-w-[720px] divide-y divide-slate-200/70 dark:divide-slate-800">
          {notificationChannels.map((c) => (
            <Row
              key={c.id}
              label={c.label}
              checked={prefs.channels[c.id]}
              onChange={(v) => update("channels", c.id, v)}
            />
          ))}
        </ul>
      </SettingsSection>
    </>
  );
}

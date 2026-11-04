"use client";

import { Bell, Send } from "lucide-react";
import { notificationChannels } from "@/lib/settings-data";
import { SettingsPageHeader, SettingsSection } from "./settings-parts";

/** In-app notifications (the bell) are always on. Sending by e-mail / Telegram / WhatsApp needs external services. */
export function NotificationsForm() {
  return (
    <>
      <SettingsPageHeader title="Notifikasi" subtitle="Kabar tentang pesanan, saldo, dan tiketmu." />

      <SettingsSection icon={Bell} title="Di dalam aplikasi">
        <p className="max-w-[520px] text-[10.5px] text-[#5B6B8C] dark:text-slate-400">
          Notifikasi tampil di ikon lonceng dan selalu aktif: status pesanan, refund, deposit, balasan tiket, dan pengumuman.
        </p>
      </SettingsSection>

      <SettingsSection icon={Send} title="Saluran lain">
        <ul className="max-w-[520px] divide-y divide-slate-200/70 dark:divide-slate-800">
          {notificationChannels.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-4 py-3.5">
              <p className="text-[10.5px] font-semibold text-ink dark:text-white">{c.label}</p>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9.5px] font-medium text-slate-600 dark:bg-slate-500/15 dark:text-slate-300">Belum tersedia</span>
            </li>
          ))}
        </ul>
      </SettingsSection>
    </>
  );
}

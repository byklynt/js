"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Pencil, Trophy, Upload } from "lucide-react";
import { settingsNav, userRank } from "@/lib/settings-data";
import type { SettingsNavItem } from "@/lib/settings-data";
import { useDashboardUser } from "@/components/shell/user-context";
import { useToast } from "@/components/shared/toast";
import { Dialog } from "@/components/ui/dialog";
import { outlineButtonClass, primaryButtonClass } from "@/components/ui/text-field";
import { cn } from "@/lib/utils";

function AvatarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Ubah foto profil"
      description="Unggah foto PNG atau JPG, maksimal 2 MB."
      maxWidth="max-w-sm"
    >
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-[10px] text-[#5B6B8C] transition hover:border-primary-300 dark:border-slate-600 dark:text-slate-400">
        <Upload className="h-5 w-5 text-primary-accent" aria-hidden />
        <span>{file ? file.name : "Pilih foto dari perangkatmu"}</span>
        <input
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className={outlineButtonClass}>
          Batal
        </button>
        <button
          type="button"
          disabled={!file}
          onClick={() => {
            // TODO: upload the avatar to the backend.
            toast("Foto profil diperbarui");
            setFile(null);
            onClose();
          }}
          className={cn(primaryButtonClass, "h-9 w-auto px-5")}
        >
          Simpan
        </button>
      </div>
    </Dialog>
  );
}

/** Two-column settings layout: vertical settings nav + content. Fills the dashboard main area edge to edge. */
export function SettingsShell({
  children,
  nav = settingsNav,
  badge = userRank,
  label = "Pengaturan akun",
}: {
  children: React.ReactNode;
  nav?: SettingsNavItem[];
  /** Pill under the e-mail (rank for users, role for admins). */
  badge?: string;
  label?: string;
}) {
  const pathname = usePathname();
  const { username, email } = useDashboardUser();
  const [avatarOpen, setAvatarOpen] = useState(false);

  return (
    <div className="-mx-4 -mt-6 -mb-10 flex min-h-[calc(100vh-67px)] flex-col sm:-mx-6 md:flex-row lg:-mx-[53px] lg:-mt-[60px]">
      <aside className="shrink-0 border-b border-slate-200/70 bg-white p-4 md:w-[215px] md:border-r md:border-b-0 md:p-5 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center gap-3 md:flex-col md:items-start md:gap-0">
          <button
            type="button"
            onClick={() => setAvatarOpen(true)}
            aria-label="Ubah foto profil"
            className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-soft text-[22px] font-semibold text-primary-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {username.charAt(0).toUpperCase()}
            <span className="absolute right-0 bottom-0 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 border-white bg-[#0F1B3D] text-white dark:border-slate-950 dark:bg-[#1B2733]">
              <Pencil className="h-2.5 w-2.5" aria-hidden />
            </span>
          </button>
          <div className="min-w-0 md:mt-4">
            <p className="truncate text-[13px] font-semibold text-ink dark:text-white">{username}</p>
            <p className="truncate text-[10px] text-[#5B6B8C] dark:text-slate-400">{email}</p>
            <span className="mt-3 hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-[9.5px] font-semibold text-amber-700 md:inline-flex dark:bg-amber-500/15 dark:text-amber-300">
              <Trophy className="h-3.5 w-3.5" aria-hidden />
              {badge}
            </span>
          </div>
        </div>

        <nav
          aria-label={label}
          className="thin-scroll -mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:mt-6 md:flex-col md:overflow-visible md:px-0 md:pb-0"
        >
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-2.5 rounded-xl px-3 text-[10.5px] font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  active
                    ? "bg-[#0F1B3D] text-white shadow-sm dark:bg-[#1B2733]"
                    : "text-ink hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-white/5"
                )}
              >
                <item.icon className="h-4 w-4 stroke-[1.75]" aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 bg-white dark:bg-slate-950">{children}</div>
      <AvatarDialog open={avatarOpen} onClose={() => setAvatarOpen(false)} />
    </div>
  );
}

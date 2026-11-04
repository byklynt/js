"use client";

import { useState } from "react";
import { Eye, Megaphone, Pencil, Plus, Trash2, Users } from "lucide-react";
import { audienceLabels, levelLabels, placementLabels, type Announcement, type AnnouncementAudience, type AnnouncementLevel, type AnnouncementPlacement, type PublicAnnouncement } from "@/lib/announcements-data";
import { deleteAnnouncement, saveAnnouncement } from "@/lib/admin-actions";
import { formatDateTime } from "@/lib/balance";
import type { ServiceUpdate } from "@/lib/updates-data";
import { PageHeader } from "@/components/shell/page-header";
import { AnnouncementBanner } from "@/components/announcements/announcement-banner";
import { AnnouncementUpdateRow } from "@/components/updates/update-row";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useAdminRunner } from "../use-admin-runner";
import { ActiveChip } from "../admin-chips";

const levelTone: Record<AnnouncementLevel, ChipTone> = { info: "sky", penting: "amber", peringatan: "red" };

function toLocalInput(iso: string): string {
  // datetime-local expects yyyy-MM-ddTHH:mm; the mock keeps the wall-clock part of the stored value.
  return iso.slice(0, 16);
}

/** The exact components users see: the dashboard banner and the row on the updates page. */
/** "Now" as a datetime-local value in WIB (the default publish time of a new announcement). */
const nowLocalInput = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" }).slice(0, 16).replace(" ", "T");

function Preview({ title, body, level, audience, placements, publishAt, count }: {
  title: string; body: string; level: AnnouncementLevel; audience: AnnouncementAudience; placements: AnnouncementPlacement[]; publishAt: string; count: number;
}) {
  const item: PublicAnnouncement = {
    id: "preview", title: title || "Judul pengumuman", body: body || "Isi pengumuman akan tampil di sini.", level, publishAt: publishAt ? `${publishAt}:00+07:00` : new Date().toISOString(), updatedAt: "preview",
  };
  const row: ServiceUpdate = {
    id: "preview", serviceId: "", platform: "", name: item.title, type: "pengumuman", date: item.publishAt.slice(0, 10), detail: item.body,
    announcement: { body: item.body, level, publishAt: item.publishAt },
  };
  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-[10px] text-[#5B6B8C] dark:text-slate-400">
        <Users className="h-3.5 w-3.5" aria-hidden />
        Tampil untuk <strong className="text-ink dark:text-white">{count.toLocaleString("id-ID")} pengguna</strong> ({audienceLabels[audience].toLowerCase()}, perkiraan)
      </p>
      {placements.includes("dashboard") ? (
        <div>
          <p className="mb-1.5 text-[9.5px] font-semibold text-[#5B6B8C] uppercase dark:text-slate-400">Di dashboard</p>
          <AnnouncementBanner item={item} onDismiss={() => {}} />
        </div>
      ) : null}
      {placements.includes("pembaruan") ? (
        <div>
          <p className="mb-1.5 text-[9.5px] font-semibold text-[#5B6B8C] uppercase dark:text-slate-400">Di halaman Pembaruan</p>
          <ul className="pointer-events-none"><AnnouncementUpdateRow update={row} index={0} /></ul>
        </div>
      ) : null}
      {placements.length === 0 ? <p className="text-[10px] text-amber-600 dark:text-amber-300">Pilih minimal satu tempat tampil.</p> : null}
    </div>
  );
}

function Editor({ item, counts, onClose }: { item: Announcement | null; counts: Record<AnnouncementAudience, number>; onClose: () => void }) {
  const run = useAdminRunner();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [audience, setAudience] = useState<AnnouncementAudience>(item?.audience ?? "semua");
  const [placements, setPlacements] = useState<AnnouncementPlacement[]>(item?.placements ?? ["dashboard"]);
  const [level, setLevel] = useState<AnnouncementLevel>(item?.level ?? "info");
  const [publishAt, setPublishAt] = useState(toLocalInput(item?.publishAt ?? nowLocalInput()));
  const [expiresAt, setExpiresAt] = useState(item?.expiresAt ? toLocalInput(item.expiresAt) : "");
  const [active, setActive] = useState(item?.active ?? true);
  const [showPreview, setShowPreview] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const toggle = (p: AnnouncementPlacement, on: boolean) => setPlacements((cur) => (on ? Array.from(new Set([...cur, p])) : cur.filter((x) => x !== p)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const result = await run(saveAnnouncement({ id: item?.id, title, body, audience, placements, level, publishAt, expiresAt: expiresAt || null, active }));
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <form noValidate onSubmit={submit} className="space-y-3.5">
        <TextField label="Judul" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea label="Isi pengumuman" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[110px]" />
        <div>
          <p className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">Tampil untuk</p>
          <SegmentedControl<AnnouncementAudience>
            items={[{ value: "semua", label: "Semua pengguna" }, { value: "reseller", label: "Reseller" }]}
            value={audience}
            onChange={setAudience}
            ariaLabel="Penerima pengumuman"
            className="h-10"
          />
        </div>
        <div>
          <p className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">Tingkat</p>
          <SegmentedControl<AnnouncementLevel>
            items={[{ value: "info", label: "Info" }, { value: "penting", label: "Penting" }, { value: "peringatan", label: "Peringatan" }]}
            value={level}
            onChange={setLevel}
            ariaLabel="Tingkat pengumuman"
            className="h-10"
          />
        </div>
        <div className="space-y-2">
          {([
            ["Tampil di dashboard", placements.includes("dashboard"), (v: boolean) => toggle("dashboard", v)],
            ["Tampil di halaman Pembaruan", placements.includes("pembaruan"), (v: boolean) => toggle("pembaruan", v)],
            ["Aktif", active, setActive],
          ] as const).map(([label, value, setter]) => (
            <div key={label} className="flex items-center justify-between rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
              <span className="text-[10.5px] font-medium text-ink dark:text-white">{label}</span>
              <ToggleSwitch checked={value} onChange={setter} label={label} />
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Jadwal tayang" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
          <TextField label="Berakhir (opsional)" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} hint="Kosongkan agar tidak berakhir." />
        </div>
        {error ? <p role="alert" className="text-[9.5px] font-medium text-red-500">{error}</p> : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setShowPreview((v) => !v)} aria-pressed={showPreview}>
            <Eye className="h-3.5 w-3.5" aria-hidden />
            Pratinjau
          </Button>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={busy}>Simpan</Button>
        </div>
      </form>
      {showPreview ? (
        <div aria-label="Pratinjau pengumuman" role="region">
          <p className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">Pratinjau</p>
          <Preview title={title} body={body} level={level} audience={audience} placements={placements} publishAt={publishAt} count={counts[audience]} />
        </div>
      ) : null}
    </div>
  );
}

export function AnnouncementsView({ announcements, counts }: { announcements: Announcement[]; counts: Record<AnnouncementAudience, number> }) {
  const run = useAdminRunner();
  const [editing, setEditing] = useState<{ item: Announcement | null } | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);

  function toggleActive(a: Announcement, active: boolean) {
    return run(saveAnnouncement({ ...a, active }));
  }

  return (
    <div>
      <PageHeader title="Pengumuman" subtitle="Atur pengumuman untuk pengguna." />
      <div className="mt-8 flex justify-end">
        <Button onClick={() => setEditing({ item: null })}>
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Buat pengumuman
        </Button>
      </div>

      {announcements.length === 0 ? (
        <div className="mt-5">
          <EmptyState icon={Megaphone} title="Belum ada pengumuman" />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {announcements.map((a) => (
            <li key={a.id} className="list-none rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[12px] font-semibold text-ink dark:text-white">{a.title}</h2>
                    <ActiveChip active={a.active} />
                    <StatusChip label={a.audience === "semua" ? "Semua" : "Reseller"} tone={a.audience === "semua" ? "sky" : "purple"} />
                    <StatusChip label={levelLabels[a.level]} tone={levelTone[a.level]} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-relaxed text-[#2B3A5C] dark:text-slate-300">{a.body}</p>
                  <p className="mt-2 text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
                    Tayang <time dateTime={a.publishAt}>{formatDateTime(a.publishAt)}</time>
                    {a.expiresAt ? <> - berakhir <time dateTime={a.expiresAt}>{formatDateTime(a.expiresAt)}</time></> : null}
                    {a.placements.map((p) => ` - ${placementLabels[p]}`).join("")}
                    {" - "}Tampil untuk {counts[a.audience].toLocaleString("id-ID")} pengguna
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <ToggleSwitch checked={a.active} label={`Aktifkan pengumuman ${a.title}`} onChange={(v) => void toggleActive(a, v)} />
                  <Button variant="outline" className="h-8" onClick={() => setEditing({ item: a })}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                    Ubah
                  </Button>
                  <Button variant="outline" className="h-8" aria-label={`Hapus pengumuman ${a.title}`} onClick={() => setDeleting(a)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.item ? "Ubah pengumuman" : "Buat pengumuman"}
        description="Pratinjau menunjukkan tampilan yang sama persis dengan yang dilihat pengguna."
        maxWidth="max-w-3xl"
      >
        {editing ? <Editor key={editing.item?.id ?? "new"} item={editing.item} counts={counts} onClose={() => setEditing(null)} /> : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title="Hapus pengumuman?"
        description={`"${deleting?.title ?? ""}" akan dihapus permanen.`}
        confirmLabel="Hapus"
        requireText="HAPUS"
        requirePassword
        onConfirm={async (password) => {
          if (!deleting) return;
          const result = await run(deleteAnnouncement({ id: deleting.id, confirm: "HAPUS", password }));
          if (result.ok) setDeleting(null);
        }}
      />
    </div>
  );
}

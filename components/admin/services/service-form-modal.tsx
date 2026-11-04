"use client";

import { useState } from "react";
import { finalPrice, type AdminService, type MarkupType, type PublicProvider } from "@/lib/admin-data";
import { createService, updateService } from "@/lib/admin-actions";
import { formatIdr } from "@/lib/balance";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TextField } from "@/components/ui/text-field";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useAdminRunner } from "../use-admin-runner";

type FormState = {
  name: string;
  providerId: string;
  providerServiceId: string;
  providerPrice: string;
  markupType: MarkupType;
  markup: string;
  min: string;
  max: string;
  refill: boolean;
  cancel: boolean;
  active: boolean;
  sort: string;
};

function toState(s: AdminService | null, providers: PublicProvider[]): FormState {
  return {
    name: s?.name ?? "",
    providerId: s?.providerId ?? providers[0]?.id ?? "",
    providerServiceId: s?.providerServiceId ?? "",
    providerPrice: s ? String(s.providerPrice) : "",
    markupType: s?.markupType ?? "persen",
    markup: s ? String(s.markup) : "40",
    min: s ? String(s.min) : "10",
    max: s ? String(s.max) : "100000",
    refill: s?.refill ?? false,
    cancel: s?.cancel ?? false,
    active: s?.active ?? true,
    sort: s ? String(s.sort) : "0",
  };
}

const field = "h-[34px] w-full rounded-xl border border-slate-200 bg-white px-3 text-[10px] text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary dark:border-slate-700 dark:bg-slate-900 dark:text-white";

/** Create or edit a service. Validation also runs on the server (zod) inside the actions. */
export function ServiceFormModal({
  open,
  service,
  categoryId,
  providers,
  onClose,
}: {
  open: boolean;
  /** null = create. */
  service: AdminService | null;
  categoryId: string;
  providers: PublicProvider[];
  onClose: () => void;
}) {
  const run = useAdminRunner();
  const [form, setForm] = useState<FormState>(() => toState(service, providers));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const preview = Number(form.providerPrice) > 0
    ? finalPrice({ providerPrice: Number(form.providerPrice), markupType: form.markupType, markup: Number(form.markup) || 0 })
    : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const payload = {
      ...form,
      providerPrice: Number(form.providerPrice),
      markup: Number(form.markup),
      min: Number(form.min),
      max: Number(form.max),
      sort: Number(form.sort),
    };
    const result = await run(service ? updateService({ id: service.id, ...payload }) : createService({ categoryId, ...payload }));
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={service ? `Ubah layanan ${service.id}` : "Tambah layanan"}
      description="Harga akhir dihitung otomatis dari harga provider dan markup."
      maxWidth="max-w-lg"
    >
      <form noValidate onSubmit={submit} className="space-y-3.5">
        <TextField label="Nama layanan" value={form.name} onChange={(e) => set("name", e.target.value)} />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label htmlFor="svc-provider" className="mb-1.5 block text-[10.5px] font-semibold text-ink dark:text-slate-200">
              Provider
            </label>
            <select id="svc-provider" value={form.providerId} onChange={(e) => set("providerId", e.target.value)} className={field}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <TextField label="ID layanan di provider" value={form.providerServiceId} onChange={(e) => set("providerServiceId", e.target.value)} />
          <TextField label="Harga provider (per 1000)" inputMode="decimal" value={form.providerPrice} onChange={(e) => set("providerPrice", e.target.value)} />
          <TextField label={form.markupType === "persen" ? "Markup (%)" : "Markup (Rp)"} inputMode="decimal" value={form.markup} onChange={(e) => set("markup", e.target.value)} />
        </div>
        <div>
          <p className="mb-1.5 text-[10.5px] font-semibold text-ink dark:text-slate-200">Jenis markup</p>
          <SegmentedControl<MarkupType>
            items={[{ value: "persen", label: "Persen (%)" }, { value: "tetap", label: "Tetap (Rp)" }]}
            value={form.markupType}
            onChange={(v) => set("markupType", v)}
            ariaLabel="Jenis markup"
            className="h-10 max-w-[280px]"
          />
        </div>
        <p className="rounded-xl bg-[#F1F6FB] px-3 py-2 text-[10.5px] text-ink dark:bg-[#161b20] dark:text-white">
          Harga akhir: <span className="font-semibold">{formatIdr(preview)}</span> / 1000
        </p>
        <div className="grid gap-3.5 sm:grid-cols-3">
          <TextField label="Minimal" inputMode="numeric" value={form.min} onChange={(e) => set("min", e.target.value)} />
          <TextField label="Maksimal" inputMode="numeric" value={form.max} onChange={(e) => set("max", e.target.value)} />
          <TextField label="Urutan" inputMode="numeric" value={form.sort} onChange={(e) => set("sort", e.target.value)} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {([["refill", "Refill"], ["cancel", "Bisa dibatalkan"], ["active", "Aktif"]] as const).map(([key, label]) => (
            <div key={key} className="flex items-center justify-between rounded-xl border border-slate-200/70 px-3 py-2 dark:border-slate-800">
              <span className="text-[10.5px] font-medium text-ink dark:text-white">{label}</span>
              <ToggleSwitch checked={form[key]} onChange={(v) => set(key, v)} label={label} />
            </div>
          ))}
        </div>
        {error ? (
          <p role="alert" className="text-[9.5px] font-medium text-red-500">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={busy}>
            Simpan
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

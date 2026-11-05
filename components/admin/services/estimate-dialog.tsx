"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
import type { AdminService } from "@/lib/admin-data";
import { resetServiceStats, setServiceEstimate } from "@/lib/admin-actions";
import { chooseEstimate } from "@/lib/service-estimate";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { TextField } from "@/components/ui/text-field";
import { useAdminRunner } from "../use-admin-runner";

/** What the admin sees for a service: measured numbers, an optional manual text (wins until the minimum is reached) and "Reset statistik". */
export function estimateSummary(s: AdminService) {
  const measured = chooseEstimate(s.estimate ? { ...s.estimate, override: undefined } : undefined);
  const shown = chooseEstimate(s.estimate);
  return { samples: s.estimate?.n ?? 0, measured, shown, override: s.estimateOverride ?? null, min: s.estimate?.ms };
}

export function EstimateDialog({ service, onClose }: { service: AdminService | null; onClose: () => void }) {
  const run = useAdminRunner();
  const [text, setText] = useState(service?.estimateOverride ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const sum = service ? estimateSummary(service) : null;

  async function save(value: string) {
    if (!service) return;
    setBusy(true);
    setError("");
    const result = await run(setServiceEstimate({ serviceId: service.id, text: value }));
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
    <>
      <Dialog
        open={Boolean(service)}
        onClose={onClose}
        title={service ? `Estimasi layanan ${service.id}` : "Estimasi"}
        description="Dihitung dari pesanan yang selesai normal. Estimasi manual hanya tampil sampai data terukur mencapai batas minimum."
        maxWidth="max-w-md"
      >
        {service && sum ? (
          <div className="space-y-4">
            <dl className="space-y-1.5 text-[10.5px]">
              <div className="flex justify-between gap-3"><dt className="text-[#5B6B8C] dark:text-slate-400">Jumlah sampel</dt><dd className="font-semibold text-ink dark:text-white" data-testid="est-samples">{sum.samples}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#5B6B8C] dark:text-slate-400">Estimasi terukur</dt><dd className="font-semibold text-ink dark:text-white" data-testid="est-measured">{sum.measured.kind === "measured" ? sum.measured.text : "Belum ada estimasi"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-[#5B6B8C] dark:text-slate-400">Yang dilihat pengguna</dt><dd className="font-semibold text-ink dark:text-white" data-testid="est-shown">{sum.shown.text}</dd></div>
            </dl>
            <TextField label="Estimasi manual (opsional)" value={text} onChange={(e) => setText(e.target.value)} placeholder="5 - 15 menit" hint="Kosongkan lalu simpan untuk menghapus." error={error || undefined} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setConfirmReset(true)}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Reset statistik
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>Batal</Button>
                <Button loading={busy} onClick={() => void save(text)}>Simpan</Button>
              </div>
            </div>
          </div>
        ) : null}
      </Dialog>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={`Reset statistik layanan ${service?.id ?? ""}?`}
        description="Semua waktu pengerjaan yang sudah terukur untuk layanan ini dilupakan dan penghitungan mulai dari nol. Pakai ini saat provider atau layanan berubah. Tindakan dicatat di log audit."
        confirmLabel="Reset statistik"
        onConfirm={async () => {
          if (!service) return false;
          const result = await run(resetServiceStats({ serviceId: service.id }));
          if (result.ok) {
            setConfirmReset(false);
            onClose();
          }
          return result.ok;
        }}
      />
    </>
  );
}

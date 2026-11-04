"use client";

import { useEffect, useState } from "react";
import { applyMarginFix, previewMarginFix } from "@/lib/admin-actions";
import { formatIdr } from "@/lib/balance";
import type { MarkupChange } from "@/lib/server/pricing";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PasswordField } from "@/components/ui/text-field";
import { useAdminRunner } from "../use-admin-runner";

/** Preview the diff, then confirm with the admin password. Nothing changes until "Terapkan". */
export function MarginFixModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Terapkan markup otomatis" description="Harga jual layanan bermargin tipis dinaikkan sampai margin minimum. Perubahan tampil di halaman Pembaruan pengguna." maxWidth="max-w-xl">
      {open ? <MarginFixBody onClose={onClose} /> : null}
    </Dialog>
  );
}

function MarginFixBody({ onClose }: { onClose: () => void }) {
  const run = useAdminRunner();
  const [changes, setChanges] = useState<MarkupChange[] | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void previewMarginFix({}).then((r) => {
      if (r.ok) setChanges((r.data as { changes: MarkupChange[] }).changes);
      else setError(r.error);
    });
  }, []);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return setError("Password wajib diisi untuk konfirmasi.");
    setBusy(true);
    const result = await run(applyMarginFix({ password }));
    setBusy(false);
    if (result.ok) onClose();
    else setError(result.error);
  }

  return (
      <form onSubmit={apply} noValidate className="space-y-3">
        {changes === null ? (
          <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Menghitung perubahan...</p>
        ) : changes.length === 0 ? (
          <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Tidak ada layanan dengan margin tipis.</p>
        ) : (
          <div className="max-h-64 overflow-auto rounded-xl border border-slate-200/70 dark:border-slate-800">
            <table className="w-full text-left text-[10px]">
              <thead className="text-[#5B6B8C] dark:text-slate-400">
                <tr><th scope="col" className="p-2">Layanan</th><th scope="col" className="p-2">Harga</th><th scope="col" className="p-2">Margin</th></tr>
              </thead>
              <tbody>
                {changes.map((c) => (
                  <tr key={c.serviceId} className="border-t border-slate-200/70 dark:border-slate-800">
                    <td className="max-w-[200px] truncate p-2" title={c.name}>{c.serviceId} - {c.name}</td>
                    <td className="p-2 whitespace-nowrap">{formatIdr(c.oldPrice)} → <b>{formatIdr(c.newPrice)}</b></td>
                    <td className="p-2 whitespace-nowrap">{c.oldMargin}% → <b>{c.newMargin}%</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PasswordField label="Password admin" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={error || undefined} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
          <Button type="submit" loading={busy} disabled={!changes || changes.length === 0}>Terapkan</Button>
        </div>
      </form>
  );
}

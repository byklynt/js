"use client";

import { useState } from "react";
import { Ban, ListChecks } from "lucide-react";
import { saveCancelPolicy, saveOrderRule } from "@/lib/admin-actions";
import { formatDateTime } from "@/lib/balance";
import { RULE_KEYS, RULE_LABELS, cancelPolicySentences, type CancelPolicy, type OrderRuleSet, type RuleKey } from "@/lib/order-rules";
import { SettingsPageHeader, SettingsSection } from "@/components/settings/settings-parts";
import { Button } from "@/components/ui/button";
import { FilterPill } from "@/components/ui/filter-pill";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { useAdminRunner } from "../use-admin-runner";

function RuleEditor({ rule }: { rule: OrderRuleSet }) {
  const run = useAdminRunner();
  const [title, setTitle] = useState(rule.title);
  const [bullets, setBullets] = useState(rule.bullets.join("\n"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      noValidate
      className="max-w-[720px] space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        const result = await run(saveOrderRule({ key: rule.key, title, bullets: bullets.split("\n").map((b) => b.trim()).filter(Boolean) }));
        setBusy(false);
        if (!result.ok) setError(result.error);
      }}
    >
      <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">
        Versi sekarang <strong className="text-ink dark:text-white">{rule.version}</strong>, diubah {formatDateTime(rule.updatedAt)}. Menyimpan menaikkan versi: pengguna harus menyetujui ulang sebelum memesan.
      </p>
      <TextField label="Judul kartu" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea label="Poin ketentuan (satu per baris)" value={bullets} onChange={(e) => setBullets(e.target.value)} className="min-h-[180px]" error={error || undefined} hint="Tampil di kartu Baca dulu sebelum order dan di halaman Kebijakan Refund." />
      <Button type="submit" loading={busy}>Simpan ketentuan</Button>
    </form>
  );
}

export function OrderRulesForm({ rules, policy }: { rules: Record<RuleKey, OrderRuleSet>; policy: CancelPolicy }) {
  const run = useAdminRunner();
  const [key, setKey] = useState<RuleKey>("instagram");
  const [age, setAge] = useState(String(policy.minAgeHours));
  const [percent, setPercent] = useState(String(policy.refundPercent));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sentences = cancelPolicySentences({ minAgeHours: Number(age) || 0, refundPercent: Number(percent) || 0 });

  return (
    <>
      <SettingsPageHeader title="Ketentuan Order" subtitle="Yang harus dibaca dan disetujui pengguna sebelum memesan, dan aturan pembatalan." />
      <SettingsSection icon={ListChecks} title="Ketentuan per platform">
        <div className="mb-4">
          <FilterPill options={RULE_KEYS.map((k) => ({ id: k, label: RULE_LABELS[k] }))} value={key} onChange={setKey} ariaLabel="Pilih platform" />
        </div>
        <RuleEditor key={`${key}-${rules[key].version}`} rule={rules[key]} />
      </SettingsSection>

      <SettingsSection icon={Ban} title="Kebijakan pembatalan oleh pengguna">
        <form
          noValidate
          className="max-w-[720px] space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            const result = await run(saveCancelPolicy({ minAgeHours: age, refundPercent: percent }));
            setBusy(false);
            if (!result.ok) setError(result.error);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Pembatalan bisa diajukan setelah (jam)" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ""))} />
            <TextField label="Refund dari bagian yang belum terkirim (%)" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value.replace(/\D/g, ""))} error={error || undefined} />
          </div>
          <div className="rounded-xl border border-slate-200/70 bg-slate-50 p-3.5 text-[10px] leading-relaxed text-[#2B3A5C] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <p className="mb-1 font-semibold text-ink dark:text-white">Teks yang dilihat pengguna</p>
            <p>{sentences.user}</p>
            <p className="mt-1.5">{sentences.provider}</p>
            <p className="mt-1.5">{sentences.partial}</p>
          </div>
          <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">Angka ini dipakai di kartu order, dialog pembatalan, dan halaman Kebijakan Refund. Menyimpan menaikkan versi semua ketentuan.</p>
          <Button type="submit" loading={busy}>Simpan kebijakan</Button>
        </form>
      </SettingsSection>
    </>
  );
}

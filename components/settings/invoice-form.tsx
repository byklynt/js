"use client";

import { useState } from "react";
import { Loader2, Receipt } from "lucide-react";
import { saveSettings } from "@/lib/dashboard-actions";
import { useToast } from "@/components/shared/toast";
import { TextField, primaryButtonClass } from "@/components/ui/text-field";
import { SettingsPageHeader, SettingsSection } from "./settings-parts";

type Values = {
  fullName: string;
  company: string;
  address: string;
  city: string;
  postalCode: string;
  taxId: string;
};

const empty: Values = { fullName: "", company: "", address: "", city: "", postalCode: "", taxId: "" };

function validate(v: Values): Partial<Record<keyof Values, string>> {
  const errors: Partial<Record<keyof Values, string>> = {};
  if (!v.fullName.trim()) errors.fullName = "Nama lengkap wajib diisi.";
  if (!v.address.trim()) errors.address = "Alamat wajib diisi.";
  if (!v.city.trim()) errors.city = "Kota wajib diisi.";
  if (!/^\d{5}$/.test(v.postalCode.trim())) errors.postalCode = "Kode pos harus 5 digit.";
  const tax = v.taxId.replace(/[.\-\s]/g, "");
  if (tax && !/^\d{15,16}$/.test(tax)) errors.taxId = "NPWP harus 15 atau 16 digit.";
  return errors;
}

export function InvoiceForm() {
  const toast = useToast();
  const [values, setValues] = useState<Values>(empty);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const errors = validate(values);

  const set = (key: keyof Values) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((prev) => ({ ...prev, [key]: e.target.value }));
  const shown = (key: keyof Values) => (submitted ? errors[key] : undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) return;
    setSubmitting(true);
    try {
      await saveSettings("invoice", values);
      toast("Detail invoice disimpan");
    } catch {
      toast("Gagal menyimpan detail invoice.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SettingsPageHeader title="Detail Invoice" subtitle="Data ini akan tampil di invoice pembayaranmu." />
      <SettingsSection icon={Receipt} title="Data penagihan">
        <form noValidate onSubmit={handleSubmit} className="max-w-[720px] space-y-4">
          <TextField label="Nama lengkap" autoComplete="name" value={values.fullName} onChange={set("fullName")} error={shown("fullName")} />
          <TextField label="Nama perusahaan (opsional)" autoComplete="organization" value={values.company} onChange={set("company")} />
          <TextField label="Alamat" autoComplete="street-address" value={values.address} onChange={set("address")} error={shown("address")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Kota" autoComplete="address-level2" value={values.city} onChange={set("city")} error={shown("city")} />
            <TextField
              label="Kode pos"
              inputMode="numeric"
              maxLength={5}
              autoComplete="postal-code"
              value={values.postalCode}
              onChange={(e) => setValues((p) => ({ ...p, postalCode: e.target.value.replace(/\D/g, "") }))}
              error={shown("postalCode")}
            />
          </div>
          <TextField
            label="NPWP (opsional)"
            inputMode="numeric"
            placeholder="15 atau 16 digit"
            value={values.taxId}
            onChange={set("taxId")}
            error={shown("taxId")}
          />
          <button type="submit" disabled={submitting} className={primaryButtonClass}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Simpan
          </button>
        </form>
      </SettingsSection>
    </>
  );
}

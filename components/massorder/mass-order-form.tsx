"use client";

import { useId, useState } from "react";
import { CheckCircle2, ListChecks, Loader2 } from "lucide-react";
import type { ServiceRow } from "@/lib/services-types";
import { fetchServicesByIds } from "@/lib/services-client";
import { formatMaxQty, isNoLimit } from "@/lib/service-format";
import { createMassOrder, type MassOrderLine } from "@/lib/dashboard-actions";
import { ImpliedAcceptanceNote } from "@/components/dashboard/order-rules-card";
import { formatIdr } from "@/lib/balance";
import { isValidLink } from "@/lib/validation";
import { useToast } from "@/components/shared/toast";
import { primaryButtonClass } from "@/components/ui/text-field";
import { cn } from "@/lib/utils";

const SAMPLE = [
  "12001 | https://t.me/kanalpromosi/482 | 1000",
  "12002 | https://www.instagram.com/p/C9xKq2LsT7a/ | 500",
].join("\n");

type ParseResult = { lines: MassOrderLine[]; errors: string[]; total: number };
type RawLine = { n: number; serviceId: string; link: string; quantity: number };

/** Step 1: the shape of each line (no catalogue needed). */
function parseRaw(text: string): { raw: RawLine[]; errors: string[] } {
  const raw: RawLine[] = [];
  const errors: string[] = [];
  text.split("\n").forEach((rawLine, index) => {
    if (!rawLine.trim()) return;
    const n = index + 1;
    const parts = rawLine.split("|").map((p) => p.trim());
    if (parts.length !== 3 || parts.some((p) => !p)) {
      errors.push(`Baris ${n}: gunakan format id_layanan | link | jumlah.`);
      return;
    }
    const [serviceId, link, qtyText] = parts;
    if (!isValidLink(link)) {
      errors.push(`Baris ${n}: link tidak valid.`);
      return;
    }
    const quantity = Number(qtyText.replace(/\./g, ""));
    if (!Number.isInteger(quantity) || quantity <= 0) {
      errors.push(`Baris ${n}: jumlah harus berupa angka bulat.`);
      return;
    }
    raw.push({ n, serviceId, link, quantity });
  });
  return { raw, errors };
}

/** Step 2: limits and prices, checked against only the services named in the text (fetched from the server by id). */
function validateLines(raw: RawLine[], byId: Map<string, ServiceRow>): ParseResult {
  const lines: MassOrderLine[] = [];
  const errors: string[] = [];
  let total = 0;
  for (const { n, serviceId, link, quantity } of raw) {
    const service = byId.get(serviceId);
    if (!service) {
      errors.push(`Baris ${n}: layanan ${serviceId} tidak ditemukan.`);
      continue;
    }
    if (quantity < service.min) {
      errors.push(`Baris ${n}: jumlah minimal ${service.min.toLocaleString("id-ID")}.`);
      continue;
    }
    if (quantity > service.max) {
      errors.push(isNoLimit(service.max) ? `Baris ${n}: jumlah terlalu besar.` : `Baris ${n}: jumlah maksimal ${formatMaxQty(service.max)}.`);
      continue;
    }
    lines.push({ serviceId, link, quantity });
    total += (service.price * quantity) / 1000;
  }
  return { lines, errors, total: Math.round(total) };
}

type Summary = { count: number; total: number; orderIds: string[] };

/** Textarea-based bulk order form with per-line validation and a result summary. */
export function MassOrderForm() {
  const toast = useToast();
  const fieldId = useId();
  const errorsId = useId();
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSummary(null);
    if (!text.trim()) {
      setErrors(["Isi minimal satu baris pesanan."]);
      return;
    }
    const shape = parseRaw(text);
    if (shape.errors.length > 0) {
      setErrors(shape.errors);
      return;
    }

    setSubmitting(true);
    try {
      const ids = [...new Set(shape.raw.map((l) => l.serviceId))];
      if (ids.length > 100) {
        setErrors(["Maksimal 100 layanan berbeda per kiriman."]);
        return;
      }
      const rows = await fetchServicesByIds(ids);
      const parsed = validateLines(shape.raw, new Map(rows.map((r) => [r.id, r])));
      setErrors(parsed.errors);
      if (parsed.errors.length > 0 || parsed.lines.length === 0) return;
      const result = await createMassOrder(parsed.lines);
      if (result.success) {
        setSummary({ count: parsed.lines.length, total: parsed.total, orderIds: result.orderIds });
        setText("");
        toast(`${parsed.lines.length} pesanan berhasil dikirim`);
      } else {
        setErrors([result.message]);
      }
    } catch {
      setErrors(["Gagal mengirim order massal. Coba lagi."]);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <label htmlFor={fieldId} className="text-[10.5px] font-semibold text-ink dark:text-slate-200">
            Satu order per baris dengan format
          </label>
          <button
            type="button"
            onClick={() => {
              setText(SAMPLE);
              setErrors([]);
              setSummary(null);
            }}
            className="rounded text-[10px] font-medium text-primary-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Lihat contoh
          </button>
        </div>
        <textarea
          id={fieldId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="id_layanan | link | jumlah"
          aria-invalid={errors.length > 0}
          aria-describedby={errors.length > 0 ? errorsId : undefined}
          className={cn(
            "min-h-[268px] w-full resize-y rounded-xl border bg-white px-3.5 py-3 font-mono text-[11px] leading-relaxed text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary-ring focus:shadow-[0_0_0_5px_var(--primary-soft)] dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-600",
            errors.length > 0 ? "border-red-300 dark:border-red-900" : "border-slate-200 dark:border-slate-700"
          )}
        />
        {errors.length > 0 ? (
          <ul id={errorsId} role="alert" className="mt-1.5 space-y-0.5">
            {errors.map((err) => (
              <li key={err} className="text-[9.5px] font-medium text-red-500">
                {err}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {summary ? (
        <div
          role="status"
          className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 dark:border-emerald-900 dark:bg-emerald-500/10"
        >
          <p className="flex items-center gap-2 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            Order massal berhasil dikirim
          </p>
          <dl className="mt-2.5 grid grid-cols-2 gap-3 text-[10px]">
            <div>
              <dt className="text-[#5B6B8C] dark:text-slate-400">Jumlah pesanan</dt>
              <dd className="mt-0.5 text-[12px] font-semibold text-ink dark:text-white">{summary.count}</dd>
            </div>
            <div>
              <dt className="text-[#5B6B8C] dark:text-slate-400">Total biaya</dt>
              <dd className="mt-0.5 text-[12px] font-semibold text-ink dark:text-white">{formatIdr(summary.total)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-[10px] text-[#5B6B8C] dark:text-slate-400">ID pesanan:</p>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {summary.orderIds.map((id) => (
              <li
                key={id}
                className="rounded-full bg-primary-solid px-2.5 py-1 text-[9.5px] font-semibold text-white"
              >
                #{id}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <button type="submit" disabled={submitting} className={primaryButtonClass}>
        {submitting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Memproses...
          </>
        ) : (
          <>
            <ListChecks className="h-3.5 w-3.5" />
            Kirim
          </>
        )}
      </button>
      <ImpliedAcceptanceNote />
    </form>
  );
}

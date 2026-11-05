"use client";

import { ListChecks } from "lucide-react";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { MassOrderForm } from "./mass-order-form";
import { useLanguage } from "@/lib/i18n/provider";

export function MassOrderPage({ hasServices }: { hasServices: boolean }) {
  const { t } = useLanguage();
  return (
    <div>
      <HeaderZone />
      <PageHeading
        align="center"
        title="Order Massal"
        subtitle="Kamu bisa membuat banyak pesanan sekaligus dengan memasukkan satu order per baris."
        subtitleClassName="mx-auto max-w-sm"
      />

      <div className="relative mt-[42px]">
        <HeaderLine top={50} />
        <section
          aria-labelledby="mass-order-title"
          className="relative z-10 mx-auto w-full max-w-[524px] rounded-3xl border border-slate-200/70 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-soft text-primary-accent">
              <ListChecks className="h-4 w-4" aria-hidden />
            </span>
            <h2 id="mass-order-title" className="text-[13px] font-semibold text-ink dark:text-white">
              Order Massal
            </h2>
          </div>
          <div className="mt-5">
            {!hasServices ? (
              <div role="status" className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-6 py-10 text-center dark:border-slate-700 dark:bg-slate-900/40">
                <p className="text-[11px] font-semibold text-ink dark:text-slate-200">{t("order.noServices")}</p>
                <p className="mt-1 text-[10px] text-[#5B6B8C] dark:text-slate-400">{t("order.noServicesHint")}</p>
              </div>
            ) : (
              <MassOrderForm />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

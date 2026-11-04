"use client";

import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import type { DepositConfig } from "@/lib/user-actions";
import { AddFundsCard } from "./add-funds-card";
import { BonusInfoCard } from "./bonus-info-card";

export function AddFundsPage({ config }: { config: DepositConfig }) {
  return (
    <div>
      <HeaderZone />
      <PageHeading align="center" title="Tambah Saldo" subtitle="Ajukan deposit, lalu admin menambahkan saldo setelah pembayaran diterima." />

      <div className="relative mt-[42px]">
        <HeaderLine top={50} />
        <div className="mx-auto max-w-[524px]">
          <AddFundsCard config={config} />
          <BonusInfoCard tiers={config.bonusTiers} />
        </div>
      </div>
    </div>
  );
}

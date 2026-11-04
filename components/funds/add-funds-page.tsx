"use client";

import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { AddFundsCard } from "./add-funds-card";
import { BonusInfoCard } from "./bonus-info-card";

export function AddFundsPage() {
  return (
    <div>
      <HeaderZone />
      <PageHeading
        align="center"
        title="Tambah Saldo"
        subtitle="Tambah saldo ke akunmu dengan mudah."
      />

      <div className="relative mt-[42px]">
        <HeaderLine top={50} />
        <div className="mx-auto max-w-[524px]">
          <AddFundsCard />
          <BonusInfoCard />
        </div>
      </div>
    </div>
  );
}

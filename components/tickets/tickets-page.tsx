"use client";

import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";
import { TicketForm } from "./ticket-form";

export function TicketsPage() {
  return (
    <div>
      <HeaderZone />
      <PageHeading
        align="center"
        title="Dukungan 24/7"
        subtitle="Kirim tiket ke tim support kami dan dapatkan bantuan untuk kendalamu."
        subtitleClassName="mx-auto max-w-[290px]"
      />

      <div className="relative mt-[42px]">
        <HeaderLine top={50} />
        <TicketForm />
      </div>
    </div>
  );
}

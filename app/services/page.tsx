import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { PublicPage } from "@/components/landing/public-page";
import { ServicesList } from "@/components/landing/services-list";
import { getPublicCatalogue } from "@/lib/server/services";

export const metadata: Metadata = {
  title: "Daftar Layanan - JagoanSosmed",
  description: "Daftar layanan dan harga JagoanSosmed per 1000.",
};

export default function Page() {
  return (
    <PublicPage title="Daftar Layanan" subtitle="Harga per 1000. Daftar untuk memesan.">
      <Suspense fallback={<p className="text-sm text-slate-500">Memuat layanan...</p>}>
        <Catalog />
      </Suspense>
    </PublicPage>
  );
}

async function Catalog() {
  await connection(); // the catalogue changes whenever an admin applies a provider sync
  const { categories, items } = await getPublicCatalogue();
  return <ServicesList categories={categories.map((c) => ({ id: c.id, label: c.label }))} items={items} />;
}

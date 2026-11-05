import type { Metadata } from "next";
import { Suspense } from "react";
import { ServicesPage } from "@/components/services/services-page";

export const metadata: Metadata = { title: "Layanan - JagoanSosmed" };

export default function Page(props: PageProps<"/dashboard/services">) {
  return (
    <Suspense fallback={<ServicesPage />}>
      <ServicesPageContent searchParams={props.searchParams} />
    </Suspense>
  );
}

async function ServicesPageContent({
  searchParams,
}: {
  searchParams: PageProps<"/dashboard/services">["searchParams"];
}) {
  const params = await searchParams;
  const search = params.search;
  const initialSearch = (Array.isArray(search) ? search[0] : search) ?? "";
  return (
    <ServicesPage initialSearch={initialSearch} />
  );
}

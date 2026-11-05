import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { ServicesView } from "@/components/admin/services/services-view";
import { getDb, toPublicProvider } from "@/lib/admin-db";
import { adminServicesMeta, adminServicesPage } from "@/lib/server/admin-services";

export const metadata: Metadata = { title: "Layanan - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {() => {
        const db = getDb();
        // Only the first page and the category list with counts: the catalogue itself is fetched page by page.
        return <ServicesView initial={adminServicesPage(db)} meta={adminServicesMeta(db)} providers={db.providers.map(toPublicProvider)} minMargin={db.settings.pricing.minMarginPercent} />;
      }}
    </AdminData>
  );
}

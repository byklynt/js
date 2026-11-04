import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { ServicesView } from "@/components/admin/services/services-view";
import { getDb, toPublicProvider } from "@/lib/admin-db";

export const metadata: Metadata = { title: "Layanan - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {() => {
        const db = getDb();
        // Demo services of removed demo providers (live mode) are not part of the catalogue.
        const known = new Set(db.providers.map((p) => p.id));
        return <ServicesView services={db.services.filter((s) => known.has(s.providerId))} providers={db.providers.map(toPublicProvider)} minMargin={db.settings.pricing.minMarginPercent} />;
      }}
    </AdminData>
  );
}

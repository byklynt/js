import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { ServicesView } from "@/components/admin/services/services-view";
import { toPublicProvider } from "@/lib/admin-db";
import { loadProviders } from "@/lib/server/repo/providers";
import { loadSettings } from "@/lib/server/repo/settings";
import { adminServicesMeta, adminServicesPage } from "@/lib/server/admin-services";

export const metadata: Metadata = { title: "Layanan - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        // Only the first page and the category list with counts: the catalogue itself is fetched page by page.
        const [initial, meta, providers, settings] = await Promise.all([adminServicesPage(), adminServicesMeta(), loadProviders(), loadSettings()]);
        return <ServicesView initial={initial} meta={meta} providers={providers.map(toPublicProvider)} minMargin={settings.pricing.minMarginPercent} />;
      }}
    </AdminData>
  );
}

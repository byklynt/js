import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { ProvidersView } from "@/components/admin/providers/providers-view";
import { getDb, toPublicProvider } from "@/lib/admin-db";
import { describeConfig, LIKEO_ID, resolveModeInfo } from "@/lib/server/providers/config";
import { ensureFreshBalance } from "@/lib/server/providers/ensure";

export const metadata: Metadata = { title: "Provider - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        const db = getDb();
        // Dev only: what the server resolved, in one line (no key, only whether it is set).
        if (process.env.NODE_ENV !== "production") console.info(describeConfig());
        await ensureFreshBalance();
        const { mode, source, warning } = resolveModeInfo();
        const pricing = db.settings.pricing;
        return (
          <ProvidersView
            providers={db.providers.map(toPublicProvider)}
            mode={mode}
            modeSource={source}
            modeWarning={warning}
            pricing={{
              currency: pricing.currency, rateIdr: pricing.rateIdr, roundTo: pricing.roundTo, defaultMarkup: pricing.defaultMarkup,
              providerMarkup: pricing.providerMarkups[LIKEO_ID] ?? pricing.defaultMarkup,
            }}
          />
        );
      }}
    </AdminData>
  );
}

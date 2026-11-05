import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { ProvidersView } from "@/components/admin/providers/providers-view";
import { toPublicProvider } from "@/lib/admin-db";
import { loadProviders } from "@/lib/server/repo/providers";
import { loadSettings } from "@/lib/server/repo/settings";
import { describeConfig, LIKEO_ID, resolveModeInfo } from "@/lib/server/providers/config";
import { ensureFreshBalance } from "@/lib/server/providers/ensure";

export const metadata: Metadata = { title: "Provider - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        // Dev only: what the server resolved, in one line (no key, only whether it is set).
        if (process.env.NODE_ENV !== "production") console.info(describeConfig());
        await ensureFreshBalance();
        const { mode, source, warning } = resolveModeInfo();
        const [providers, settings] = await Promise.all([loadProviders(), loadSettings()]);
        const pricing = settings.pricing;
        return (
          <ProvidersView
            providers={providers.map(toPublicProvider)}
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

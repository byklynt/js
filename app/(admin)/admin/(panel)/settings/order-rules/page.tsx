import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { OrderRulesForm } from "@/components/admin/settings/order-rules-form";
import { loadSettings } from "@/lib/server/repo/settings";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {async () => {
        const { orderRules, cancelPolicy } = (await loadSettings());
        return <OrderRulesForm rules={orderRules} policy={cancelPolicy} />;
      }}
    </AdminData>
  );
}

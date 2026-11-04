import type { Metadata } from "next";
import { AdminData } from "@/components/admin/admin-fetch";
import { OrderRulesForm } from "@/components/admin/settings/order-rules-form";
import { getDb } from "@/lib/admin-db";

export const metadata: Metadata = { title: "Pengaturan Situs - Admin JagoanSosmed" };

export default function Page() {
  return (
    <AdminData>
      {() => {
        const { orderRules, cancelPolicy } = getDb().settings;
        return <OrderRulesForm rules={orderRules} policy={cancelPolicy} />;
      }}
    </AdminData>
  );
}

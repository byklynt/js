import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { DepositPay, DepositPaySkeleton } from "@/components/funds/deposit-pay";
import { getMyDepositView } from "@/lib/user-actions";

export const metadata: Metadata = { title: "Pembayaran - JagoanSosmed", robots: { index: false } };

/**
 * Payment page of one top-up (the return_url of Paymenku). Owner only: the row is read on the user's own session, so another user's id is simply not found.
 * Nothing in the query string is trusted: the status comes from our database, which only changes after the server verified the payment with Paymenku.
 */
export default function Page({ params }: PageProps<"/deposit/[id]">) {
  return (
    <Suspense fallback={<DepositPaySkeleton />}>
      <Content params={params} />
    </Suspense>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const view = await getMyDepositView((await params).id);
  if (!view || !view.gateway) notFound();
  return <DepositPay initial={view} />;
}

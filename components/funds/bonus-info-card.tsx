import Link from "next/link";
import { Info } from "lucide-react";

export function BonusInfoCard() {
  return (
    <section
      aria-labelledby="bonus-title"
      className="mt-4 rounded-3xl border border-slate-200/70 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <Info className="h-[18px] w-[18px] text-ink dark:text-white" aria-hidden />
      <h2 id="bonus-title" className="mt-3.5 text-[13px] font-semibold text-ink dark:text-white">
        Bonus Deposit Pertama 10%
      </h2>
      <p className="mt-2 text-[10px] leading-[1.9] text-[#5B6B8C] dark:text-slate-400">
        Kamu berhak mendapat bonus deposit pertama gratis hingga Rp 50.000. Buka{" "}
        <Link
          href="/dashboard/tickets"
          className="font-medium text-primary-accent underline-offset-2 hover:underline"
        >
          tiket
        </Link>
        , sebutkan jumlah depositmu, dan kami akan menambahkan bonusnya.
      </p>
    </section>
  );
}

import Link from "next/link";
import { SearchX } from "lucide-react";
import { HeaderLine, HeaderZone } from "@/components/shell/header-zone";
import { PageHeading } from "@/components/shell/page-heading";

/** A payment that does not exist, or that belongs to somebody else: the same card as the payment page, with nothing about the payment itself. */
export default function NotFound() {
  return (
    <div>
      <HeaderZone />
      <PageHeading align="center" title="Pembayaran" subtitle="Detail pembayaran tidak bisa ditampilkan." />
      <div className="relative mt-[42px]">
        <HeaderLine top={50} />
        <section aria-labelledby="deposit-nf" className="relative z-10 mx-auto w-full max-w-[500px] rounded-3xl border border-slate-200/70 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-500/15" aria-hidden>
            <SearchX className="h-7 w-7" />
          </span>
          <h2 id="deposit-nf" className="mt-3 text-[14px] font-semibold text-ink dark:text-white">Pembayaran tidak ditemukan</h2>
          <p className="mx-auto mt-1 max-w-[340px] text-[10.5px] leading-relaxed text-[#5B6B8C] dark:text-slate-400">Pembayaran ini tidak ada atau bukan milik akunmu. Cek lagi tautannya, atau lihat riwayat pembayaranmu di Tambah Saldo.</p>
          <Link href="/dashboard/add-funds" className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-gradient-to-b from-primary-from to-primary-to px-5 text-[11px] font-semibold text-white shadow-[0_2px_0_var(--primary-pressed)] transition hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border dark:border-white/25">
            Kembali ke Tambah Saldo
          </Link>
        </section>
      </div>
    </div>
  );
}

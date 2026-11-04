import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { H2, LegalPage } from "@/components/legal/legal-page";
import { getDb } from "@/lib/admin-db";
import { cancelPolicySentences, RULE_KEYS } from "@/lib/order-rules";

export const metadata: Metadata = { title: "Kebijakan Refund - JagoanSosmed" };

// TODO(legal): teks contoh. Angka dan aturan di bawah dibaca dari pengaturan yang sama dengan kartu order dan dialog pembatalan.
export default function Page() {
  return (
    <LegalPage title="Kebijakan Refund" subtitle="Aturan ini sama dengan yang dijalankan sistem. Angkanya dibaca langsung dari pengaturan.">
      <Suspense fallback={<p>Memuat kebijakan...</p>}>
        <Policy />
      </Suspense>
    </LegalPage>
  );
}

async function Policy() {
  await connection();
  const { cancelPolicy, orderRules } = getDb().settings;
  const s = cancelPolicySentences(cancelPolicy);
  return (
    <>
      <section>
        <H2>Pesanan dibatalkan penyedia atau gagal dikirim</H2>
        <p>{s.provider}</p>
      </section>
      <section>
        <H2>Pesanan sebagian (partial)</H2>
        <p>{s.partial}</p>
      </section>
      <section id="pembatalan-pengguna">
        <H2>Pembatalan yang kamu ajukan sendiri</H2>
        <p>{s.user}</p>
        <p className="mt-2">Permintaan masuk ke antrean admin. Admin menyetujui atau menolak (disertai alasan). Hitungan memakai sisa pesanan saat disetujui, dan hasilnya tidak pernah melebihi biaya pesanan.</p>
        <p className="mt-2">Aturan {cancelPolicy.refundPercent}% hanya untuk pembatalan yang kamu ajukan. Pembatalan oleh penyedia dan pesanan gagal kirim tetap dikembalikan penuh secara otomatis.</p>
      </section>
      <section>
        <H2>Pesanan selesai</H2>
        <p>Pesanan yang selesai tidak otomatis direfund. Jika ada masalah, ajukan permintaan refund atau buka tiket. Admin akan memeriksanya dan memberi alasan jika ditolak.</p>
      </section>
      <section>
        <H2>Refill</H2>
        <p>Layanan bergaransi refill dapat diajukan refill selama masa garansi, satu kali per 24 jam untuk tiap pesanan.</p>
      </section>
      <section>
        <H2>Batas</H2>
        <p>Total refund tidak pernah melebihi biaya pesanan. Refund selalu kembali ke saldo JagoanSosmed. Link yang salah tidak bisa dibatalkan maupun direfund.</p>
      </section>
      <section id="ketentuan-order">
        <H2>Ketentuan order per platform</H2>
        <p className="mb-3">Kamu menyetujui ketentuan platform yang bersangkutan sebelum setiap pesanan. Versi terbaru berlaku.</p>
        <div className="space-y-4">
          {RULE_KEYS.map((k) => {
            const r = orderRules[k];
            return (
              <article key={k} className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {r.label} <span className="text-xs font-normal text-slate-500">(versi {r.version})</span>
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {r.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

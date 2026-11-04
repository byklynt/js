import type { Metadata } from "next";
import { H2, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = { title: "Syarat & Ketentuan - JagoanSosmed" };

// TODO(legal): teks contoh. Minta peninjauan hukum sebelum dipakai di produksi.
export default function Page() {
  return (
    <LegalPage title="Syarat & Ketentuan" subtitle="Terakhir diperbarui 4 November 2026. Teks contoh, belum ditinjau secara hukum.">
      <section>
        <H2>1. Layanan</H2>
        <p>JagoanSosmed menyediakan layanan pemasaran media sosial. Hasil dan kecepatan dapat berbeda antar layanan dan tidak dijamin untuk platform pihak ketiga.</p>
      </section>
      <section>
        <H2>2. Akun dan keamanan</H2>
        <p>Kamu bertanggung jawab atas akun dan passwordmu. Satu orang satu akun. Akun yang menyalahgunakan layanan dapat dibatasi atau diblokir.</p>
      </section>
      <section>
        <H2>3. Pesanan</H2>
        <p>Pastikan tautan benar dan akun target bersifat publik. Pesanan tidak dapat diubah setelah diproses. Pesanan yang sama untuk tautan yang sama tidak bisa dibuat selagi pesanan sebelumnya masih berjalan.</p>
      </section>
      <section>
        <H2>4. Saldo dan pembayaran</H2>
        <p>Saldo yang sudah ditambahkan hanya bisa dipakai untuk pesanan di JagoanSosmed. Setiap perubahan saldo tercatat di halaman Mutasi Saldo.</p>
      </section>
      <section>
        <H2>5. Refund</H2>
        <p>
          Ketentuan refund dijelaskan di{" "}
          <a className="text-primary-600 underline dark:text-primary-300" href="/refund-policy">
            Kebijakan Refund
          </a>
          .
        </p>
      </section>
      <section>
        <H2>6. Penyalahgunaan</H2>
        <p>Permintaan batal atau refund yang berulang secara tidak wajar dapat membuat pesanan dan refund akunmu ditinjau manual oleh admin.</p>
      </section>
    </LegalPage>
  );
}

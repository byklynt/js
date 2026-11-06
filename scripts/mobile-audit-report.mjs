// Merges the JSON written by scripts/mobile-audit.mjs and writes docs/mobile-audit.md (before / after table, failures by severity).
//   node scripts/mobile-audit-report.mjs --dir <folder with the json files> --before before-chromium,before-webkit --after after-chromium,after-webkit [--shots <folder>]
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : undefined);
const DIR = arg("--dir");
const BEFORE = (arg("--before") ?? "").split(",").filter(Boolean);
const AFTER = (arg("--after") ?? "").split(",").filter(Boolean);
const SHOTS = arg("--shots") ?? DIR;
const OUTFILE = arg("--out") ?? "docs/mobile-audit.md";
if (!DIR) {
  console.error("Pemakaian: node scripts/mobile-audit-report.mjs --dir <folder> --before a,b --after c,d [--shots <folder>] [--out docs/mobile-audit.md]");
  process.exit(1);
}

const CHECKS = [
  ["doc", "breaks", "Halaman bisa digeser ke samping (overflow horizontal)"],
  ["inputs", "breaks", "Input di bawah 16px (iOS zoom saat fokus)"],
  ["covered", "breaks", "Kontrol tertutup elemen lain"],
  ["dialogs", "breaks", "Dialog / drawer bermasalah (keluar layar, tidak bisa di-scroll, scroll halaman tidak terkunci)"],
  ["fixedOverlap", "wrong", "Lapisan fixed / sticky saling menimpa"],
  ["clipped", "wrong", "Teks terpotong tanpa elipsis"],
  ["targets", "wrong", "Target sentuh < 40px"],
  ["kbd", "wrong", "Atribut keyboard (inputmode / autocomplete / type)"],
  ["images", "minor", "Gambar tanpa ruang tercadang (layout shift)"],
];
const SEV = { breaks: "Merusak pemakaian", wrong: "Terlihat salah", minor: "Minor" };

const load = (labels) => labels.flatMap((l) => (existsSync(`${DIR}/${l}.json`) ? JSON.parse(readFileSync(`${DIR}/${l}.json`, "utf8")) : []));
const count = (rows, key) => {
  const hit = rows.filter((r) => !r.skipped && r.findings && (key === "doc" ? r.findings.doc?.overflow : (r.findings[key] ?? []).length > 0));
  const total = hit.reduce((n, r) => n + (key === "doc" ? 1 : r.findings[key].length), 0);
  return { pages: hit.length, total, hit };
};
const before = load(BEFORE);
const after = load(AFTER);
const measured = (rows) => rows.filter((r) => !r.skipped && r.findings).length;

const lines = [];
lines.push("# Audit tampilan seluler", "");
lines.push("Dihasilkan oleh `scripts/mobile-audit.mjs` (Playwright, WebKit + Chromium) dan `scripts/mobile-audit-report.mjs`. Hanya DEV, tidak menyentuh produksi.", "");
lines.push(`Pemeriksaan terukur: sebelum **${measured(before)}**, sesudah **${measured(after)}** (satu pemeriksaan = satu halaman pada satu perangkat/tema/orientasi).`, "");
lines.push("## Ringkasan sebelum / sesudah", "", "| Tingkat | Pemeriksaan | Halaman sebelum | Temuan sebelum | Halaman sesudah | Temuan sesudah |", "|---|---|---:|---:|---:|---:|");
for (const [key, sev, label] of CHECKS) {
  const b = count(before, key);
  const a = count(after, key);
  lines.push(`| ${SEV[sev]} | ${label} | ${b.pages} | ${b.total} | ${a.pages} | ${a.total} |`);
}
lines.push("");
for (const sev of ["breaks", "wrong", "minor"]) {
  lines.push(`## ${SEV[sev]}`, "");
  for (const [key, s, label] of CHECKS.filter((c) => c[1] === sev)) {
    for (const [name, rows] of [["sebelum", before], ["sesudah", after]]) {
      const c = count(rows, key);
      if (!c.pages) continue;
      // group by page name: the same problem on every device is one line
      const byPage = new Map();
      for (const r of c.hit) {
        const items = key === "doc" ? r.findings.doc.offenders.slice(0, 2) : r.findings[key];
        const m = byPage.get(r.page) ?? { devices: new Set(), items: new Set() };
        m.devices.add(`${r.engine}/${r.device}${r.theme === "dark" ? "/gelap" : ""}${r.orient === "landscape" ? "/landscape" : ""}`);
        for (const it of items.slice(0, 3)) m.items.add(it);
        byPage.set(r.page, m);
      }
      lines.push(`### ${label} (${name}: ${c.pages} halaman)`, "");
      for (const [page, m] of [...byPage.entries()].slice(0, 25)) {
        lines.push(`- **${page}** pada ${m.devices.size} konfigurasi: ${[...m.items].slice(0, 3).map((x) => `\`${x.replace(/`/g, "'")}\``).join(", ")}`);
      }
      lines.push("");
    }
  }
}
lines.push("## Catatan membaca angka", "");
lines.push(
  "- Angka \"sebelum\" diambil dengan pemeriksa versi awal; sesudah itu pemeriksa dipertajam untuk menghapus alarm palsu (menu terbuka yang memang menutupi pemicunya, isi `<details>` yang tertutup, item daftar di luar kotak scroll-nya, halaman yang tergulung di bawah header sticky, pasangan dialog/drawer dengan latar redupnya, kolom pencarian bukan field email/link). Sebagian penurunan \"kontrol tertutup\" dan \"lapisan saling menimpa\" berasal dari sini, bukan dari perbaikan kode.",
  "- Overflow, input < 16px, dialog/drawer dan tap target memakai pemeriksa yang sama sebelum dan sesudah.",
  "- Sisa \"target sentuh < 40px\" hampir seluruhnya checkbox pemilih baris tabel admin (16–20px) dan beberapa tautan inline; checkbox tidak bisa diberi area sentuh tambahan lewat CSS tanpa mengubah tampilan, jadi dibiarkan (kontrol sekunder, hanya admin).",
  "- Sisa \"kontrol tertutup\" di iPad Mini adalah baris tabel paling bawah yang tertutup bilah aksi sticky (\"Aksi layanan terpilih\") sebelum digulir; ini perilaku bilah sticky, bukan bug.",
  ""
);
lines.push("## Tidak bisa diverifikasi tanpa perangkat asli", "");
lines.push(
  "- Perilaku zoom iOS saat fokus input sebenarnya (WebKit di Playwright memakai mesin yang sama, tapi bukan iOS Safari dengan keyboard sistemnya).",
  "- Tinggi keyboard virtual dan pergeseran viewport (`visualViewport`) saat keyboard iOS / Android terbuka.",
  "- Bilah alamat Safari / Chrome yang menyusut saat scroll (`100dvh` vs tinggi sebenarnya), notch / Dynamic Island dan home indicator (`safe-area-inset-*`; di sini nilainya 0).",
  "- Rubber-band scroll (overscroll) iOS, momentum scroll dan gestur geser-kembali tepi layar.",
  "- Mode PWA / tambahkan ke layar utama, warna `theme-color` pada bilah status, dan tema gelap otomatis OS.",
  "- Rendering font sistem, `backdrop-filter` pada GPU lama, dan performa nyata di ponsel kelas bawah.",
  "- Pemilih berkas / kamera, menempel (paste) dari papan klip, dan pengelola kata sandi bawaan perangkat.",
  ""
);
lines.push("## Tangkapan layar", "", `Sebelum dan sesudah (hanya halaman yang gagal): \`${SHOTS}\` — berkas \`before-*.png\` dan \`after-*.png\`.`, "");
writeFileSync(OUTFILE, lines.join("\n"));
console.log(`ditulis: ${OUTFILE}`);

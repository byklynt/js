// Dev only: npm run brand:assets [-- --write]
// Reads /public/brand/logo-mark.png, samples its dominant (background) color, and generates the favicon / app icons:
//   app/icon.png (512), app/apple-icon.png (180), public/brand/icon-32.png, icon-192.png, icon-512.png
// With --write it also updates the three brand tokens (--brand, --brand-hover, --brand-soft in app/globals.css) and
// brandColors in lib/brand.ts when the sampled blue differs from the current one. The logo itself is never altered.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SRC = "public/brand/logo-mark.png";
if (!existsSync(SRC)) {
  console.error(`${SRC} tidak ditemukan. Simpan logo (PNG) di path itu lalu jalankan lagi.`);
  process.exit(1);
}

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height } = info;
const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

// Dominant color = the most common opaque color after rounding each channel to steps of 4 (ignores anti-aliasing).
const counts = new Map();
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] < 250) continue;
  const key = `${data[i] >> 2},${data[i + 1] >> 2},${data[i + 2] >> 2}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
}
const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
const [qr, qg, qb] = best[0].split(",").map(Number);
// Average the exact pixels inside that bucket for the real value.
let sr = 0, sg = 0, sb = 0, n = 0;
for (let i = 0; i < data.length; i += 4) {
  if (data[i + 3] < 250) continue;
  if (data[i] >> 2 === qr && data[i + 1] >> 2 === qg && data[i + 2] >> 2 === qb) {
    sr += data[i]; sg += data[i + 1]; sb += data[i + 2]; n++;
  }
}
const primary = hex(sr / n, sg / n, sb / n);
const share = ((best[1] / (width * height)) * 100).toFixed(1);
console.log(`logo ${width}x${height}px | warna dominan: ${primary} (${share}% piksel)`);

const mix = (rgb, other, t) => rgb.map((v, i) => v * (1 - t) + other[i] * t);
const rgb = [sr / n, sg / n, sb / n];
const hover = hex(...mix(rgb, [0, 0, 0], 0.12));
const soft = hex(...mix(rgb, [255, 255, 255], 0.9));
console.log(`turunan: --brand ${primary} | --brand-hover ${hover} | --brand-soft ${soft}`);

// ---- icons (resized only, never edited)
const out = [
  ["app/icon.png", 512], ["app/apple-icon.png", 180],
  ["public/brand/icon-32.png", 32], ["public/brand/icon-192.png", 192], ["public/brand/icon-512.png", 512],
];
for (const [file, size] of out) {
  await sharp(SRC).resize(size, size, { fit: "cover" }).png().toFile(file);
  console.log("tulis", file, `${size}x${size}`);
}

// ---- optional: update the tokens
if (process.argv.includes("--write")) {
  let css = readFileSync("app/globals.css", "utf8");
  css = css.replace(/--brand: #[0-9a-fA-F]{6};/, `--brand: ${primary.toLowerCase()};`).replace(/--brand-hover: #[0-9a-fA-F]{6};/, `--brand-hover: ${hover.toLowerCase()};`).replace(/--brand-soft: #[0-9a-fA-F]{6};/, `--brand-soft: ${soft.toLowerCase()};`);
  writeFileSync("app/globals.css", css);
  let ts = readFileSync("lib/brand.ts", "utf8");
  ts = ts.replace(/light: "#[0-9a-fA-F]{6}"/, `light: "${primary}"`);
  writeFileSync("lib/brand.ts", ts);
  console.log("token diperbarui di app/globals.css dan lib/brand.ts");
} else {
  console.log("Tambahkan --write untuk memperbarui token warna dengan nilai ini.");
}

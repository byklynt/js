/**
 * What an uploaded blog image really is: the type from its first bytes (not from the file name or the browser's claim) and its pixel size.
 * Only png, jpeg and webp are accepted.
 */
export type ImageInfo = { type: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp"; width: number; height: number };

export const MAX_BLOG_IMAGE_BYTES = 2 * 1024 * 1024;

const u32be = (b: Uint8Array, o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1];
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
const ascii = (b: Uint8Array, o: number, n: number) => String.fromCharCode(...b.slice(o, o + n));

export function sniffImage(b: Uint8Array): ImageInfo | null {
  // PNG: signature, then the IHDR chunk with width and height
  if (b.length >= 24 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && ascii(b, 12, 4) === "IHDR") {
    return { type: "image/png", ext: "png", width: u32be(b, 16), height: u32be(b, 20) };
  }
  // JPEG: FF D8 FF, then walk the segments to a start-of-frame marker
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let o = 2;
    while (o + 9 < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const marker = b[o + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
      const len = u16be(b, o + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { type: "image/jpeg", ext: "jpg", height: u16be(b, o + 5), width: u16be(b, o + 7) };
      }
      o += 2 + len;
    }
    return { type: "image/jpeg", ext: "jpg", width: 0, height: 0 };
  }
  // WebP: RIFF....WEBP with a VP8 / VP8L / VP8X chunk
  if (b.length >= 30 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") {
    const kind = ascii(b, 12, 4);
    if (kind === "VP8X") return { type: "image/webp", ext: "webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    if (kind === "VP8L") {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { type: "image/webp", ext: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (kind === "VP8 ") return { type: "image/webp", ext: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    return { type: "image/webp", ext: "webp", width: 0, height: 0 };
  }
  return null;
}

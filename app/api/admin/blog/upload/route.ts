import { randomUUID } from "node:crypto";
import { requireAdmin } from "@/lib/auth-server";
import { MAX_BLOG_IMAGE_BYTES, sniffImage } from "@/lib/image-info";
import { supabaseAdmin } from "@/lib/server/supabase-admin";

const HEADERS = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: HEADERS });

/**
 * Blog image upload (admins only: same session and 2FA check as the other admin routes). The type comes from the file's first bytes, not its name:
 * png, jpeg or webp, at most 2 MB. The stored name is random. The bucket "blog-images" is public-read and admin-write (the bucket enforces the same limits).
 * Answers { url, width, height }; the editor puts the size into the Markdown image (#WxH) so the page reserves the space.
 */
export async function POST(request: Request) {
  try {
    await requireAdmin("action");
  } catch {
    return json({ error: "Kamu tidak punya akses untuk tindakan ini." }, 401);
  }
  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    return json({ error: "Berkas tidak terbaca." }, 400);
  }
  if (!file || file.size === 0) return json({ error: "Pilih gambar dulu." }, 400);
  if (file.size > MAX_BLOG_IMAGE_BYTES) return json({ error: "Gambar maksimal 2 MB." }, 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const info = sniffImage(bytes);
  if (!info) return json({ error: "Format gambar harus PNG, JPEG, atau WebP." }, 415);

  const name = `${randomUUID()}.${info.ext}`;
  const storage = supabaseAdmin().storage.from("blog-images");
  const { error } = await storage.upload(name, bytes, { contentType: info.type, upsert: false, cacheControl: "31536000" });
  if (error) return json({ error: "Gambar tidak bisa diunggah. Coba lagi." }, 500);
  return json({ url: storage.getPublicUrl(name).data.publicUrl, width: info.width, height: info.height });
}

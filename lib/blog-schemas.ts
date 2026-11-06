import { z } from "zod";
import { isValidSlug } from "./blog-core";

/** Where cover images may come from: our own public bucket (uploaded through the editor). */
export const blogImagePrefix = (supabaseUrl: string) => `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/blog-images/`;

const uuid = z.string().uuid("ID tidak valid.");

export const blogPostSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(1, "Judul wajib diisi.").max(160, "Judul maksimal 160 karakter."),
  /** Empty = generated from the title. */
  slug: z.string().trim().max(100, "Slug maksimal 100 karakter.").refine((v) => v === "" || isValidSlug(v), "Slug hanya boleh huruf kecil, angka, dan tanda hubung (contoh: tips-order-aman)."),
  excerpt: z.string().trim().max(400, "Ringkasan maksimal 400 karakter."),
  contentMd: z.string().max(200_000, "Isi artikel terlalu panjang."),
  coverImageUrl: z.string().trim().max(600).nullable(),
  coverAlt: z.string().trim().max(200, "Teks alternatif maksimal 200 karakter."),
  categoryId: uuid.nullable(),
  /** A category typed in the editor: created when it does not exist yet. */
  newCategory: z.string().trim().max(60, "Nama kategori maksimal 60 karakter.").optional(),
  /** "a, b, c" */
  tags: z.string().max(600),
  seoTitle: z.string().trim().max(70, "Judul SEO maksimal 70 karakter."),
  seoDescription: z.string().trim().max(170, "Deskripsi meta maksimal 170 karakter."),
  /** ISO date-time or null. */
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  intent: z.enum(["draf", "terbit"]),
});
export type BlogPostInput = z.infer<typeof blogPostSchema>;

export const blogIdSchema = z.object({ id: uuid });
export const blogPublishSchema = z.object({ id: uuid, publishedAt: z.string().datetime({ offset: true }).nullable().optional() });

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus, Loader2, Save, Send, ShieldAlert } from "lucide-react";
import { saveBlogPost } from "@/lib/blog-actions";
import { postStatus, SEO_DESCRIPTION_MAX, SEO_TITLE_MAX, slugify, STATUS_LABEL } from "@/lib/blog-core";
import type { AdminPost } from "@/lib/server/blog-admin";
import { Markdown } from "@/components/landing/markdown";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TextField } from "@/components/ui/text-field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/shared/toast";
import { cn } from "@/lib/utils";

type Category = { id: string; name: string };

/** ISO -> the value of a datetime-local input (local time). */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

const selectClass =
  "h-[34px] w-full rounded-xl border border-slate-200 bg-white px-3.5 text-[10px] text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary-ring dark:border-slate-700 dark:bg-slate-900 dark:text-white";

function Counter({ value, max }: { value: string; max: number }) {
  const n = value.length;
  return <span className={cn("text-[9.5px]", n > max ? "font-semibold text-red-500" : "text-[#5B6B8C] dark:text-slate-400")}>{n}/{max}</span>;
}

async function uploadImage(file: File): Promise<{ url: string; width: number; height: number } | { error: string }> {
  const form = new FormData();
  form.set("file", file);
  try {
    const res = await fetch("/api/admin/blog/upload", { method: "POST", body: form });
    const body = (await res.json()) as { url?: string; width?: number; height?: number; error?: string };
    if (!res.ok || !body.url) return { error: body.error ?? "Gambar tidak bisa diunggah." };
    return { url: body.url, width: body.width ?? 0, height: body.height ?? 0 };
  } catch {
    return { error: "Gambar tidak bisa diunggah. Periksa koneksi." };
  }
}

export function BlogEditor({ post, categories }: { post: AdminPost | null; categories: Category[] }) {
  const router = useRouter();
  const toast = useToast();
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(post));
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [content, setContent] = useState(post?.contentMd ?? "");
  const [cover, setCover] = useState<string | null>(post?.coverImageUrl ?? null);
  const [coverAlt, setCoverAlt] = useState(post?.coverAlt ?? "");
  const [categoryId, setCategoryId] = useState(post?.categoryId ?? "");
  const [newCategory, setNewCategory] = useState("");
  const [tags, setTags] = useState((post?.tags ?? []).join(", "));
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? "");
  const [seoDescription, setSeoDescription] = useState(post?.seoDescription ?? "");
  const [publishAt, setPublishAt] = useState(toLocalInput(post?.publishedAt ?? null));
  const [tab, setTab] = useState<"tulis" | "pratinjau">("tulis");
  const [busy, setBusy] = useState<"" | "draf" | "terbit" | "cover" | "image">("");
  const [error, setError] = useState("");

  const effectiveSlug = slugTouched ? slug : slugify(title);
  const [mountedAt] = useState(() => Date.now());
  const scheduled = publishAt !== "" && new Date(publishAt).getTime() > mountedAt;
  const state = post ? postStatus({ status: post.status, publishedAt: post.publishedAt }) : "draf";

  async function save(intent: "draf" | "terbit") {
    setError("");
    if (cover && !coverAlt.trim()) {
      setError("Isi teks alternatif untuk gambar sampul.");
      return;
    }
    setBusy(intent);
    const result = await saveBlogPost({
      id: post?.id, title, slug: slugTouched ? slug : "", excerpt, contentMd: content, coverImageUrl: cover, coverAlt, categoryId: newCategory.trim() ? null : categoryId || null,
      newCategory: newCategory.trim() || undefined, tags, seoTitle, seoDescription, publishedAt: fromLocalInput(publishAt), intent,
    });
    setBusy("");
    if (!result.ok) {
      setError(result.error);
      toast(result.error, "error");
      return;
    }
    toast(result.message);
    if (!post && result.id) router.replace(`/admin/blog/${result.id}`);
    else router.refresh();
  }

  async function pickCover(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("cover");
    const up = await uploadImage(file);
    setBusy("");
    if ("error" in up) return toast(up.error, "error");
    setCover(up.url);
  }

  async function insertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy("image");
    const up = await uploadImage(file);
    setBusy("");
    if ("error" in up) return toast(up.error, "error");
    const alt = file.name.replace(/\.[^.]+$/, "").replace(/[\]\[()]/g, " ").trim() || "gambar";
    const md = `![${alt}](${up.url}${up.width && up.height ? `#${up.width}x${up.height}` : ""})`;
    const el = contentRef.current;
    const at = el?.selectionStart ?? content.length;
    setContent(`${content.slice(0, at)}${at > 0 && content[at - 1] !== "\n" ? "\n\n" : ""}${md}\n\n${content.slice(el?.selectionEnd ?? at)}`);
    toast("Gambar disisipkan ke artikel. Ubah teks alternatifnya bila perlu.");
  }

  return (
    <div>
      <PageHeader title={post ? "Ubah artikel" : "Artikel baru"} subtitle={post ? `Status: ${STATUS_LABEL[state]}` : "Tulis artikel baru untuk blog."} />
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <TextField label="Judul" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Judul artikel" />
          <TextField
            label="Slug (alamat artikel)"
            value={effectiveSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value.toLowerCase());
            }}
            hint={`/blog/${effectiveSlug || "..."}  Dibuat otomatis dari judul; boleh diubah. Harus unik.`}
          />
          <Textarea label="Ringkasan" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} maxLength={400} className="min-h-[72px]" hint="Tampil di daftar artikel dan sebagai deskripsi bila deskripsi meta kosong." />

          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold text-ink dark:text-slate-200">Isi artikel (Markdown)</span>
              <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[10px] font-medium text-ink hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
                {busy === "image" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
                Sisipkan gambar
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Sisipkan gambar ke artikel" onChange={insertImage} disabled={busy !== ""} />
              </label>
            </div>
            <SegmentedControl
              ariaLabel="Mode editor"
              items={[{ value: "tulis", label: "Tulis" }, { value: "pratinjau", label: "Pratinjau" }]}
              value={tab}
              onChange={setTab}
              className="mb-2 max-w-xs"
            />
            {tab === "tulis" ? (
              <textarea
                ref={contentRef}
                aria-label="Isi artikel"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={18}
                placeholder={"## Judul bagian\n\nTulis isi artikel dengan Markdown. Pisahkan paragraf dengan baris kosong."}
                className="min-h-[360px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 font-mono text-[11px] leading-relaxed text-ink outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary-ring dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            ) : (
              <div data-testid="blog-preview" className="min-h-[360px] rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-950">
                <h1 className="mb-4 text-2xl font-extrabold text-slate-900 dark:text-white">{title || "Judul artikel"}</h1>
                {content.trim() ? <Markdown source={content} /> : <p className="text-[11px] text-slate-400">Belum ada isi.</p>}
              </div>
            )}
            <p className="mt-2 flex items-start gap-1.5 text-[9.5px] text-amber-700 dark:text-amber-300">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Konten politik (kampanye, partai, tokoh politik, propaganda) tidak boleh dimuat di situs ini, sama seperti aturan di Syarat &amp; Ketentuan.
            </p>
          </div>
        </div>

        <aside className="space-y-4">
          <div className="space-y-3 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-ink dark:text-white">Penerbitan</p>
            <label className="block text-[10.5px] font-semibold text-ink dark:text-slate-200">
              Tanggal terbit (opsional)
              <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} aria-label="Tanggal terbit" className={cn(selectClass, "mt-1.5")} />
            </label>
            <p className="text-[9.5px] text-[#5B6B8C] dark:text-slate-400">
              Kosong = terbit sekarang. Tanggal di masa depan = terjadwal: artikel tampil sendiri pada waktu itu, tanpa perlu menekan apa pun.
            </p>
            {error ? <p role="alert" data-testid="blog-error" className="text-[9.5px] font-medium text-red-500">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void save("draf")} disabled={busy !== ""}>
                {busy === "draf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" aria-hidden />} Simpan draf
              </Button>
              <Button onClick={() => void save("terbit")} disabled={busy !== ""}>
                {busy === "terbit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" aria-hidden />} {scheduled ? "Jadwalkan" : "Terbitkan"}
              </Button>
            </div>
            <Link href="/admin/blog" className="block text-[10px] font-medium text-primary-accent hover:underline">&larr; Kembali ke daftar</Link>
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-ink dark:text-white">Kategori dan tag</p>
            <label className="block text-[10.5px] font-semibold text-ink dark:text-slate-200">
              Kategori
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Kategori" className={cn(selectClass, "mt-1.5")}>
                <option value="">Tanpa kategori</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            <TextField label="Atau buat kategori baru" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} maxLength={60} />
            <TextField label="Tag" value={tags} onChange={(e) => setTags(e.target.value)} hint="Pisahkan dengan koma. Maksimal 10." />
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-ink dark:text-white">Gambar sampul</p>
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt={coverAlt || "Sampul"} className="aspect-video w-full rounded-xl object-cover" />
            ) : null}
            <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-4 text-[10px] font-medium text-ink hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
              {busy === "cover" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" aria-hidden />}
              {cover ? "Ganti gambar" : "Unggah gambar"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Unggah gambar sampul" onChange={pickCover} disabled={busy !== ""} />
            </label>
            {cover ? <button type="button" onClick={() => setCover(null)} className="ml-2 text-[10px] font-medium text-red-500 hover:underline">Hapus</button> : null}
            <TextField label="Teks alternatif sampul" value={coverAlt} onChange={(e) => setCoverAlt(e.target.value)} maxLength={200} hint="Wajib bila ada gambar sampul. PNG, JPEG, atau WebP, maksimal 2 MB." />
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-200/70 p-4 dark:border-slate-800">
            <p className="text-[11px] font-semibold text-ink dark:text-white">SEO</p>
            <div>
              <TextField label="Judul SEO" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder={title} />
              <div className="mt-1 text-right"><Counter value={seoTitle} max={SEO_TITLE_MAX} /></div>
            </div>
            <div>
              <Textarea label="Deskripsi meta" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} placeholder={excerpt} className="min-h-[72px]" hint="Kosong = memakai ringkasan." />
              <div className="mt-1 text-right"><Counter value={seoDescription} max={SEO_DESCRIPTION_MAX} /></div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

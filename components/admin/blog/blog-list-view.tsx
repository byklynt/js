"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Eye, EyeOff, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { deleteBlogPost, publishBlogPost, unpublishBlogPost } from "@/lib/blog-actions";
import { postStatus, STATUS_LABEL, type BlogStatus } from "@/lib/blog-core";
import { formatDateTime } from "@/lib/balance";
import type { AdminPost } from "@/lib/server/blog-admin";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DataTable, type Column } from "@/components/ui/data-table";
import { DataToolbar } from "@/components/ui/data-toolbar";
import { EmptyState } from "@/components/ui/empty-state";
import { ShowMoreButton } from "@/components/ui/list-states";
import { StatusChip, type ChipTone } from "@/components/ui/status-chip";
import { useListState } from "@/lib/use-list-state";
import { useAdminRunner } from "../use-admin-runner";

type Filter = "semua" | BlogStatus;
const tone: Record<BlogStatus, ChipTone> = { draf: "slate", terbit: "emerald", terjadwal: "amber" };

export function BlogListView({ posts, limit }: { posts: AdminPost[]; limit: number }) {
  const run = useAdminRunner();
  const list = useListState<Filter>("semua", { pageSize: 15, debounceMs: 300 });
  const [toDelete, setToDelete] = useState<AdminPost | null>(null);
  const [now] = useState(() => new Date());

  const rows = useMemo(() => {
    const q = list.debounced;
    return posts.filter((p) => {
      if (list.filter !== "semua" && postStatus({ status: p.status, publishedAt: p.publishedAt }) !== list.filter) return false;
      if (!q) return true;
      return [p.title, p.slug, p.categoryName ?? "", p.authorName, ...p.tags].some((t) => t.toLowerCase().includes(q));
    });
  }, [posts, list.filter, list.debounced]);
  const shown = rows.slice(0, list.visible);

  const columns: Column<AdminPost>[] = [
    {
      key: "title",
      header: "Judul",
      cell: (p) => (
        <Link href={`/admin/blog/${p.id}`} className="block max-w-[320px] truncate font-semibold text-primary-accent hover:underline" title={p.title}>
          {p.title}
          <span className="block truncate text-[9px] font-normal text-[#5B6B8C] dark:text-slate-400">/{p.slug}</span>
        </Link>
      ),
    },
    { key: "status", header: "Status", cell: (p) => { const s = postStatus({ status: p.status, publishedAt: p.publishedAt }, now); return <StatusChip label={STATUS_LABEL[s]} tone={tone[s]} />; } },
    { key: "category", header: "Kategori", cell: (p) => p.categoryName ?? "-", hideBelowLg: true },
    { key: "author", header: "Penulis", cell: (p) => p.authorName, hideBelowLg: true },
    { key: "date", header: "Tanggal terbit", cell: (p) => (p.publishedAt ? formatDateTime(p.publishedAt) : "-"), className: "whitespace-nowrap", hideBelowLg: true },
    { key: "actions", header: "Aksi", cell: (p) => renderActions(p), className: "whitespace-nowrap text-right" },
  ];

  function renderActions(post: AdminPost) {
    const state = postStatus({ status: post.status, publishedAt: post.publishedAt }, now);
    return (
      <div className="flex items-center justify-end gap-1.5">
        <Link href={`/admin/blog/${post.id}`} aria-label={`Ubah artikel ${post.title}`} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200/70 text-ink transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800">
          <Pencil className="h-3.5 w-3.5" />
        </Link>
        {state === "draf" ? (
          <Button variant="outline" className="h-8" onClick={() => void run(publishBlogPost({ id: post.id }))}>
            <Eye className="h-3.5 w-3.5" aria-hidden /> Terbitkan
          </Button>
        ) : (
          <Button variant="outline" className="h-8" onClick={() => void run(unpublishBlogPost({ id: post.id }))}>
            <EyeOff className="h-3.5 w-3.5" aria-hidden /> Tarik
          </Button>
        )}
        <Button variant="outline" className="h-8" aria-label={`Hapus artikel ${post.title}`} onClick={() => setToDelete(post)}>
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Blog" subtitle="Tulis dan kelola artikel blog." />
      <DataToolbar
        filter={{
          options: [{ id: "semua", label: "Semua status" }, { id: "draf", label: "Draf" }, { id: "terbit", label: "Terbit" }, { id: "terjadwal", label: "Terjadwal" }],
          value: list.filter,
          onChange: list.setFilter,
          ariaLabel: "Filter status artikel",
        }}
        query={list.query}
        onQueryChange={list.setQuery}
        searchLabel="Cari artikel berdasarkan judul, slug, kategori, atau tag"
        actions={
          <Link href="/admin/blog/new">
            <Button>
              <Plus className="h-3.5 w-3.5" aria-hidden /> Tulis artikel
            </Button>
          </Link>
        }
      />
      <section aria-label="Daftar artikel" className="mt-5">
        {rows.length === 0 ? (
          <EmptyState icon={FileText} title={posts.length === 0 ? "Belum ada artikel" : "Artikel tidak ditemukan"} />
        ) : (
          <>
            <DataTable
              ariaLabel="Artikel blog"
              columns={columns}
              rows={shown}
              rowKey={(p) => p.id}
              mobileCard={(p) => {
                const s = postStatus({ status: p.status, publishedAt: p.publishedAt }, now);
                return (
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`/admin/blog/${p.id}`} className="min-w-0 text-[11px] font-semibold text-primary-accent">{p.title}</Link>
                      <StatusChip label={STATUS_LABEL[s]} tone={tone[s]} />
                    </div>
                    <p className="text-[10px] text-[#5B6B8C] dark:text-slate-400">{p.categoryName ?? "Tanpa kategori"} - {p.authorName}{p.publishedAt ? ` - ${formatDateTime(p.publishedAt)}` : ""}</p>
                    {renderActions(p)}
                  </div>
                );
              }}
            />
            {rows.length > list.visible ? <ShowMoreButton onClick={list.showMore} /> : null}
          </>
        )}
        {posts.length >= limit ? <p className="mt-3 text-center text-[10px] text-slate-400">Menampilkan {limit} artikel terbaru.</p> : null}
      </section>
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title="Hapus artikel ini?"
        description={toDelete ? `"${toDelete.title}" dihapus permanen dan tidak bisa dikembalikan. Tautan lamanya akan menghasilkan 404.` : ""}
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={async () => {
          if (!toDelete) return;
          const result = await run(deleteBlogPost({ id: toDelete.id }));
          if (result.ok) setToDelete(null);
          return result.ok;
        }}
      />
    </div>
  );
}

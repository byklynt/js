"use client";

import { Copy, Loader2, MessageSquareText } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/components/shared/toast";
import { ChipBody, chipClass, chipFocusClass } from "@/components/ui/info-chip";

type Loader = (orderId: string) => Promise<{ ok: true; comments: string[] } | { ok: false; error: string }>;

/**
 * The comments of a Custom Comments order: a chip that opens the list, with a "Salin" button. The comments are user-supplied text:
 * they are only ever rendered as React text nodes (escaped), never as HTML, and copied as plain text, one per line.
 */
export function OrderComments({ orderId, count, load }: { orderId: string; count: number; load: Loader }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "loading" | "error" | "ready"; comments: string[]; error?: string }>({ status: "idle", comments: [] });

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && state.status !== "ready" && state.status !== "loading") {
      setState({ status: "loading", comments: [] });
      try {
        const res = await load(orderId);
        setState(res.ok ? { status: "ready", comments: res.comments } : { status: "error", comments: [], error: res.error });
      } catch {
        setState({ status: "error", comments: [], error: "Komentar tidak bisa dimuat. Coba lagi." });
      }
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(state.comments.join("\n"));
      toast("Komentar disalin ke papan klip");
    } catch {
      toast("Gagal menyalin komentar", "error");
    }
  }

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={`order-comments-${orderId}`}
        data-testid={`order-comments-toggle-${orderId}`}
        className={`${chipClass} ${chipFocusClass} cursor-pointer`}
      >
        <ChipBody icon={MessageSquareText}>
          {open ? "Sembunyikan komentar" : "Lihat komentar"} ({count.toLocaleString("id-ID")})
        </ChipBody>
      </button>
      {open ? (
        <div id={`order-comments-${orderId}`} className="mt-2 rounded-xl border border-slate-200/70 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          {state.status === "loading" ? (
            <p role="status" className="flex items-center gap-2 text-[10px] text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Memuat komentar...</p>
          ) : state.status === "error" ? (
            <p role="alert" className="text-[10px] font-medium text-red-500">{state.error}</p>
          ) : (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-ink dark:text-slate-100">{state.comments.length.toLocaleString("id-ID")} komentar</span>
                <button
                  type="button"
                  onClick={copy}
                  className="flex h-7 items-center gap-1.5 rounded-full border border-slate-200 px-3 text-[10px] font-medium text-ink transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  <Copy className="h-3 w-3" /> Salin
                </button>
              </div>
              <ol data-testid={`order-comments-list-${orderId}`} className="max-h-60 list-decimal space-y-1 overflow-y-auto pl-5 text-[10.5px] text-ink dark:text-slate-200">
                {state.comments.map((c, i) => (
                  <li key={i} className="break-words whitespace-pre-wrap">{c}</li>
                ))}
              </ol>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

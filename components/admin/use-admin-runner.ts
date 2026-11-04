"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/shared/toast";
import type { ActionResult } from "@/lib/admin-actions";

/**
 * Runs an admin server action: shows a toast with the server message, refreshes the
 * server-rendered data on success, and returns whether it worked.
 */
export function useAdminRunner() {
  const toast = useToast();
  const router = useRouter();

  return useCallback(
    async (action: Promise<ActionResult>): Promise<ActionResult> => {
      try {
        const result = await action;
        if (result.ok) {
          toast(result.message ?? "Berhasil disimpan.");
          router.refresh();
        } else {
          toast(result.error, "error");
        }
        return result;
      } catch {
        toast("Terjadi kesalahan. Coba lagi.", "error");
        return { ok: false, error: "Terjadi kesalahan. Coba lagi." };
      }
    },
    [toast, router]
  );
}

"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertState = { type: "success" | "error"; message: string } | null;

export function FormAlert({ state }: { state: AlertState }) {
  return (
    <AnimatePresence>
      {state ? (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div
            className={cn(
              "mb-5 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium",
              state.type === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"
                : "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
            )}
          >
            {state.type === "success" ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{state.message}</span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

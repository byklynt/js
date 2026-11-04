"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastItem = { id: number; message: string; type: "success" | "error" };
type ToastFn = (message: string, type?: ToastItem["type"]) => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast(): ToastFn {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const toast = useCallback<ToastFn>((message, type = "success") => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, message, type }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed right-4 bottom-4 z-[70] flex flex-col items-end gap-2"
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              role="status"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "pointer-events-auto flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-[10.5px] font-medium shadow-lg dark:bg-slate-900",
                t.type === "success"
                  ? "border-emerald-200 text-emerald-700 dark:border-emerald-900 dark:text-emerald-300"
                  : "border-red-200 text-red-600 dark:border-red-900 dark:text-red-300"
              )}
            >
              {t.type === "success" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              {t.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

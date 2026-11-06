"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { authCopy } from "@/lib/auth-data";
import { DashboardPreview } from "./dashboard-preview";

export function AuthShell({
  children,
  preview,
  logoTag,
  backHref = "/",
}: {
  children: React.ReactNode;
  /** Right-column mockup. Defaults to the user dashboard preview. */
  preview?: React.ReactNode;
  /** Small pill next to the logo (e.g. "Admin"). */
  logoTag?: string;
  backHref?: string;
}) {
  return (
    <div className="flex min-h-[var(--app-h)] w-full bg-white dark:bg-slate-950">
      <div className="relative flex w-full flex-col lg:w-1/2 lg:border-r lg:border-primary-100 lg:dark:border-slate-800">
        <Link
          href={backHref}
          className="absolute left-5 top-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-300 sm:left-8 sm:top-8"
        >
          <ArrowLeft className="h-4 w-4" />
          {authCopy.backLink}
        </Link>

        <div className="flex flex-1 items-center justify-center px-6 py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="w-full max-w-md"
          >
            <div className="mb-8 flex items-center justify-center gap-2 lg:justify-start">
              <Logo size="lg" />
              {logoTag ? (
                <span className="rounded-full bg-primary-100 px-2.5 py-1 text-[11px] font-bold text-primary-700 dark:bg-primary-900/50 dark:text-primary-300">
                  {logoTag}
                </span>
              ) : null}
            </div>
            {children}
          </motion.div>
        </div>
      </div>

      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-primary-50 via-primary-50/60 to-white dark:from-primary-950/30 dark:via-slate-950 dark:to-slate-950 lg:block">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_30%_20%,color-mix(in_srgb,var(--primary-200)_50%,transparent),transparent)] dark:bg-[radial-gradient(ellipse_70%_60%_at_30%_20%,color-mix(in_srgb,var(--primary-900)_30%,transparent),transparent)]"
        />
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="absolute top-[12%] left-[10%] z-0 w-[1100px] max-w-none"
        >
          {preview ?? <DashboardPreview />}
        </motion.div>

      </div>
    </div>
  );
}

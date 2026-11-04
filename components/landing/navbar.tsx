"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { navLinks } from "@/lib/landing-data";
import { Logo } from "@/components/shared/logo";
import { ThemeToggle } from "./theme-toggle";

export function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-4 rounded-full border border-primary-100/80 bg-white/70 px-4 py-2.5 shadow-[0_8px_30px_-12px_color-mix(in_srgb,var(--brand)_35%,transparent)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/70">
        <Logo href="#top" className="pl-1" />

        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="rounded-full px-3.5 py-2 text-sm font-medium text-slate-600 transition hover:bg-primary-50 hover:text-primary-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-primary-300"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link
            href="/login"
            className="rounded-full border border-primary-200 px-4 py-2 text-sm font-semibold text-primary-600 transition hover:bg-primary-50 dark:border-slate-700 dark:text-primary-300 dark:hover:bg-slate-800"
          >
            Masuk
          </Link>
          <Link
            href="/signup"
            className="rounded-full bg-primary-solid px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-primary-500/30 transition hover:bg-primary-600"
          >
            Daftar
          </Link>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <button
            type="button"
            aria-label={open ? "Tutup menu" : "Buka menu"}
            onClick={() => setOpen((v) => !v)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-primary-100 text-primary-600 dark:border-slate-700 dark:text-primary-300"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {open ? (
        <div className="mx-auto mt-2 max-w-5xl rounded-3xl border border-primary-100 bg-white/95 p-4 shadow-lg backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95 md:hidden">
          <div className="flex flex-col gap-1">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-primary-50 hover:text-primary-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {link.label}
              </a>
            ))}
            <div className="mt-2 flex gap-2 border-t border-primary-100 pt-3 dark:border-slate-800">
              <Link
                href="/login"
                className="flex-1 rounded-full border border-primary-200 px-4 py-2 text-center text-sm font-semibold text-primary-600 dark:border-slate-700 dark:text-primary-300"
              >
                Masuk
              </Link>
              <Link
                href="/signup"
                className="flex-1 rounded-full bg-primary-solid px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Daftar
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

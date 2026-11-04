"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The logo mark exactly as provided (white "JS" monogram on the brand blue). Never redrawn or recolored. */
export const LOGO_MARK_SRC = "/brand/logo-mark.png";

const SIZES = {
  // 28px in the admin sidebar (next to the "Admin" pill), 32px in the navbar / user sidebar, 40px on the auth pages.
  sm: { mark: 28, box: "h-7 w-7", text: "text-[13px] tracking-[-0.035em]", gap: "gap-1.5" },
  md: { mark: 32, box: "h-8 w-8", text: "text-base", gap: "gap-2" },
  lg: { mark: 40, box: "h-10 w-10", text: "text-xl", gap: "gap-2.5" },
} as const;

/**
 * The one brand mark + wordmark, used on the landing page, auth pages, both sidebars, the legal pages and the previews.
 * If /public/brand/logo-mark.png is missing, a plain "JS" stand-in on the brand color shows instead of a broken image.
 */
export function Logo({
  href = "/",
  size = "md",
  className,
}: {
  href?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  // An image that failed before React attached onError (server-rendered HTML) is caught by re-checking a few times.
  useEffect(() => {
    const check = () => {
      const img = ref.current;
      if (img && img.complete && img.naturalWidth === 0) setMissing(true);
    };
    check();
    const timers = [300, 1200, 3000].map((ms) => window.setTimeout(check, ms));
    window.addEventListener("load", check);
    return () => {
      timers.forEach(window.clearTimeout);
      window.removeEventListener("load", check);
    };
  }, []);

  return (
    <Link href={href} className={cn("flex items-center", s.gap, className)}>
      {missing ? (
        <span aria-hidden className={cn("flex shrink-0 items-center justify-center rounded-xl bg-primary-solid text-[11px] font-extrabold tracking-tight text-white", s.box)}>
          JS
        </span>
      ) : (
        <Image
          ref={ref}
          src={LOGO_MARK_SRC}
          alt=""
          width={s.mark * 2}
          height={s.mark * 2}
          priority={size !== "sm"}
          onError={() => setMissing(true)}
          className={cn("shrink-0 rounded-xl", s.box)}
        />
      )}
      <span className={cn("font-extrabold tracking-tight whitespace-nowrap text-slate-900 dark:text-white", s.text)}>{brand.name}</span>
    </Link>
  );
}

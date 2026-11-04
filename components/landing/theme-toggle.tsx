"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // Mounted pattern: the server cannot know the theme, so render a neutral icon until the client has mounted.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Aktifkan mode terang" : "Aktifkan mode gelap"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-primary-100 bg-white text-primary-600 transition hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-900 dark:text-primary-300 dark:hover:bg-slate-800"
    >
      {mounted ? isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" /> : <span className="h-4 w-4" />}
    </button>
  );
}

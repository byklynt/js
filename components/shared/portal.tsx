"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noopSubscribe = () => () => {};

/**
 * Renders children at the dashboard root (the element with the `dash` class) so overlays
 * sit above the sticky top bar and sidebar while still inheriting the dark-mode tokens.
 * Falls back to document.body outside the dashboard.
 */
export function DashboardPortal({ children }: { children: React.ReactNode }) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  if (!mounted) return null;
  const target = document.querySelector<HTMLElement>(".dash") ?? document.body;
  return createPortal(children, target);
}

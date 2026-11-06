"use client";

import { useEffect, useState } from "react";

/** True on phones and tablets: the primary pointer is a finger (no hover). SSR and unknown environments count as "not touch". */
export function isTouchPrimary(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches;
}

/**
 * Whether opening a popover may focus its search field right away. On touch devices that would raise the on-screen keyboard over the list,
 * so the list shows first and the person taps the field only when they want to type. Desktop (fine pointer) keeps the auto-focus.
 */
export function canAutoFocusSearch(): boolean {
  return !isTouchPrimary();
}

/**
 * Max height (px) for a list that opens under `anchor`, kept inside the VISUAL viewport: when the on-screen keyboard is up the visual viewport is
 * shorter than the layout viewport, and a fixed max-height would put the bottom of the list behind the keyboard. Falls back to `cap` without the API.
 */
export function useVisualViewportMaxHeight(open: boolean, anchor: React.RefObject<HTMLElement | null>, cap: number, min = 144): number {
  const [h, setH] = useState(cap);
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const update = () => {
      const el = anchor.current;
      if (!el || !vv) return setH(cap);
      const bottom = el.getBoundingClientRect().bottom;
      // space between the trigger and the bottom edge of what is really visible, minus a margin for the shadow
      const room = vv.height + vv.offsetTop - bottom - 16;
      setH(Math.round(Math.max(min, Math.min(cap, room))));
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [open, anchor, cap, min]);
  return h;
}

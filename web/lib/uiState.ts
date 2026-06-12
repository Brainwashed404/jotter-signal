"use client";
import { useEffect, useState } from "react";

// Open/closed state for a collapsible section, remembered across visits in
// localStorage (keyed by a stable section id). Reads after mount (so SSR and the
// first client render both use `defaultOpen`, avoiding a hydration mismatch), then
// restores the saved state.
export function usePersistentToggle(key: string, defaultOpen: boolean) {
  const storeKey = `jotter.collapse.${key}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const v = localStorage.getItem(storeKey);
      if (v === "0") setOpen(false);
      else if (v === "1") setOpen(true);
    } catch { /* ignore */ }
  }, [storeKey]);

  const set = (next: boolean | ((o: boolean) => boolean)) => {
    setOpen((prev) => {
      const v = typeof next === "function" ? (next as (o: boolean) => boolean)(prev) : next;
      try { localStorage.setItem(storeKey, v ? "1" : "0"); } catch { /* ignore */ }
      return v;
    });
  };

  return [open, set] as const;
}

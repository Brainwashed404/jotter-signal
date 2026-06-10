"use client";
import { useState, type ReactNode } from "react";

export default function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left"
        style={{ marginBottom: open ? "0.75rem" : 0, transition: "margin-bottom 250ms ease" }}
        aria-expanded={open}
      >
        <h2 className="text-lg font-medium">{title}</h2>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="ml-auto transition-transform duration-200"
          style={{ color: "var(--muted)", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {/* CSS grid trick: animates height without JS measurement. The outer div
          transitions grid-template-rows 0fr↔1fr; the inner div's `overflow:hidden`
          makes it a scroll container, which zeroes its automatic min-width AND
          min-height — so the row collapses to 0 when closed and a wide child (the
          swipeable trending-pills row) can't blow the panel past its container width.
          NB do NOT switch this to `overflow:clip`: clip is not a scroll container, so
          the min sizes stay `auto` and the section won't collapse. */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 250ms ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>{children}</div>
      </div>
    </section>
  );
}

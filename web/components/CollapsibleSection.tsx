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
  // Overflow must be hidden while the height animates, but once fully open it has
  // to be visible: panels inside lift 2px on hover, and a permanent clip sheared
  // their top border off.
  const [settled, setSettled] = useState(defaultOpen);
  return (
    <section>
      <button
        onClick={() => setOpen((o) => { if (o) setSettled(false); return !o; })}
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
          transitions grid-template-rows 0fr↔1fr; the inner div clips overflow. */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 250ms ease",
        }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && e.propertyName === "grid-template-rows" && open) setSettled(true);
        }}
      >
        {/* minWidth:0 forces the grid item's automatic minimum to 0 so a wide child
            (e.g. the swipeable pills row) can't blow the panel past its container
            width — `overflow-x:clip` is not enough since the box isn't a scroll
            container. overflow-y only becomes `visible` once the open animation has
            settled, so a panel's 2px hover lift isn't sheared off the top; during the
            height animation both axes clip. */}
        <div style={{ minWidth: 0, overflowX: "clip", overflowY: open && settled ? "visible" : "clip" }}>
          {children}
        </div>
      </div>
    </section>
  );
}

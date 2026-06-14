"use client";
import { useState } from "react";
import SourcesGrid from "@/components/SourcesGrid";
import type { Expert } from "@/lib/types";

// Unified Experts + Publications browser: one page with a toggle between the two
// (Publications was folded into Experts so it has a home on mobile too). Both views
// link profiles to /sources/[id] (SourceProfile renders authors and publications alike).
export default function SourcesBrowser({
  authors, publications,
}: {
  authors: Expert[];
  publications: Expert[];
}) {
  const [view, setView] = useState<"authors" | "publications">("authors");
  const list = view === "authors" ? authors : publications;

  return (
    <section>
      <div
        className="flex items-center gap-2 w-full"
        style={{ paddingBottom: "0.6rem", borderBottom: "3px solid var(--text)", marginBottom: "0.75rem" }}
      >
        <h2 className="text-lg font-medium">Sources</h2>
        <div className="flex gap-1 ml-2">
          {([["authors", "Experts"], ["publications", "Publications"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="chip"
              style={view === v ? { color: "var(--accent)", borderColor: "var(--accent)", fontWeight: 500 } : {}}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {list.length > 0 ? (
        <SourcesGrid experts={list} basePath="/sources" />
      ) : (
        <p style={{ fontSize: "0.9rem", color: "var(--muted)" }}>
          No {view === "authors" ? "experts" : "publications"} yet.
        </p>
      )}
    </section>
  );
}

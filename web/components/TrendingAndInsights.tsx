"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import TrendingWidget from "@/components/TrendingWidget";
import type { Signal } from "@/lib/types";

// Strips markdown images and links to produce plain text.
// Images are inserted on their own lines (e.g. "\n![alt](url)\n") by the engine,
// so filtering lines starting with "![" reliably removes them without URL-parsing issues.
function mdStrip(t: string) {
  return t
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("!["))
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // strip links, keep text
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export default function TrendingAndInsights({ signals }: { signals: Signal[] }) {
  const [open, setOpen] = useState(true);
  const [view, setView] = useState<"news" | "insights">("news");

  // Unique sources ordered by most recently published (signals already sorted newest-first).
  // Strip the parenthetical blog/publication sub-name so pills show just the author name.
  const sources = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];
    for (const s of signals) {
      if (!seen.has(s.source_id)) {
        seen.add(s.source_id);
        const label = s.source.replace(/\s*\([^)]*\)\s*$/, "").trim();
        out.push({ id: s.source_id, label });
      }
    }
    return out;
  }, [signals]);

  // Default to the most recently published source (first in the list).
  const [source, setSource] = useState<string>(() => signals[0]?.source_id ?? "");

  // Signals for the selected source (up to 10, already limited by getRecentFeed).
  const visible = useMemo(
    () => signals.filter((s) => s.source_id === source),
    [signals, source],
  );

  return (
    <section>
      {/* Header: title + view toggle pills + collapse chevron */}
      <div
        className="flex items-center gap-2 w-full"
        style={{ marginBottom: open ? "0.75rem" : 0, transition: "margin-bottom 250ms ease" }}
      >
        <h2 className="text-lg font-medium">Latest</h2>
        <div className="flex gap-1 ml-2">
          {(["news", "insights"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="chip"
              style={
                view === v
                  ? { color: "var(--accent)", borderColor: "var(--accent)", fontWeight: 500 }
                  : {}
              }
            >
              {v === "news" ? "News" : "Insights"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="ml-auto grid place-items-center w-7 h-7 rounded"
          aria-expanded={open}
          aria-label={open ? "Collapse section" : "Expand section"}
          style={{ color: "var(--muted)" }}
        >
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className="transition-transform duration-200"
            style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* CSS grid collapse — same trick as CollapsibleSection */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 250ms ease",
          marginTop: open ? -6 : 0,
        }}
      >
        <div style={{ overflow: "hidden", paddingTop: open ? 6 : 0, paddingBottom: open ? 6 : 0 }}>
          {view === "news" ? (
            <TrendingWidget />
          ) : (
            <div className="panel p-4">
              {/* Source pills — ordered by most recently published, no "All" */}
              <div className="flex gap-1.5 mb-3 flex-nowrap overflow-x-auto no-scrollbar pb-0.5">
                {sources.map((src) => (
                  <button
                    key={src.id}
                    onClick={() => setSource(src.id)}
                    className="chip shrink-0 whitespace-nowrap"
                    style={
                      source === src.id
                        ? { color: "var(--accent)", borderColor: "var(--accent)" }
                        : {}
                    }
                  >
                    {src.label}
                  </button>
                ))}
              </div>

              {visible.length === 0 ? (
                <div className="label py-1">No recent articles.</div>
              ) : (
                <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
                  {visible.map((s, i) => {
                    const ctx = mdStrip(s.text);
                    const snippet = ctx.length > 110 ? ctx.slice(0, 110).trimEnd() + "…" : ctx;
                    return (
                      <li
                        key={i}
                        className="flex items-center max-md:items-start gap-2 text-[13px] py-1 max-md:py-1.5"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="md:truncate max-md:line-clamp-2">
                            <a
                              href={s.post_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {s.heading}
                            </a>
                            {snippet && (
                              <span className="ml-1.5" style={{ color: "var(--muted)" }}>
                                · {snippet}
                              </span>
                            )}
                          </div>
                        </div>
                        <Link
                          href={`/search?q=${encodeURIComponent(s.heading)}`}
                          className="shrink-0 grid place-items-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--panel-2)]"
                          style={{ color: "var(--accent)" }}
                          title="Search the intelligence archive"
                          aria-label="Search the archive for this insight"
                        >
                          <svg
                            width="15" height="15" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="11" cy="11" r="7" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                          </svg>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

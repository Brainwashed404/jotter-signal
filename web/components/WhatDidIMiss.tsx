"use client";
import { useEffect, useRef, useState } from "react";

// "What Did I Miss?" — LOCAL-ONLY prototype. The /api/wdim route returns
// { available:false } in production (DATA_URL set), so this renders nothing on the live site.
// Requires the claude CLI or ANTHROPIC_API_KEY — no deterministic fallback.
type Range = "day" | "week" | "month";
type Piece = { title: string; source: string; focus: string; url?: string };
type Section = { data: string; insight: string; pieces: Piece[] };
type Sections = { economy: Section; consumers: Section; technology: Section };
type Wdim = {
  available: boolean;
  range?: Range;
  mode?: "claude-cli" | "api";
  sections?: Sections | null;
};

const TABS: { id: Range; label: string }[] = [
  { id: "day", label: "Past Day" },
  { id: "week", label: "Past Week" },
  { id: "month", label: "Past Month" },
];
const SECTION_ORDER: { key: keyof Sections; label: string }[] = [
  { key: "economy", label: "Economy" },
  { key: "consumers", label: "Consumers" },
  { key: "technology", label: "Technology" },
];

function SectionBlock({ label, section }: { label: string; section: Section }) {
  return (
    <div>
      <h3 className="font-semibold text-base mb-1.5">{label}</h3>
      <p className="text-sm leading-relaxed">
        {section.data}{section.data.endsWith(".") ? "" : "."}{" "}
        <span style={{ color: "var(--muted)" }}>{section.insight}</span>
      </p>
      {/* Key articles — visually separated from the prose above */}
      <div className="mt-3 rounded-md" style={{
        border: "1px solid var(--border)",
        background: "color-mix(in srgb, var(--bg) 60%, var(--panel))",
        padding: "10px 12px",
      }}>
        <p className="label mb-2.5" style={{ color: "var(--accent)" }}>Key Articles</p>
        <ul className="space-y-2.5">
          {section.pieces.map((p, i) => (
            <li key={i} className="text-[13px] leading-snug">
              {p.url ? (
                <a href={p.url} target="_blank" rel="noopener noreferrer"
                  className="font-medium hover:underline underline-offset-2"
                  style={{ color: "inherit" }}>
                  {p.title}
                </a>
              ) : (
                <span className="font-medium">{p.title}</span>
              )}
              {p.source && <span style={{ color: "var(--muted)" }}> · {p.source}</span>}
              {p.focus && <div className="mt-0.5" style={{ color: "var(--muted)" }}>{p.focus}</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function WhatDidIMiss() {
  const [open, setOpen] = useState(true);
  const [range, setRange] = useState<Range>("day");
  const [cache, setCache] = useState<Partial<Record<Range, Wdim>>>({});
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loadingRanges, setLoadingRanges] = useState<Set<Range>>(new Set());
  const didPrefetch = useRef(false);

  const addLoading = (r: Range) => setLoadingRanges((s) => new Set(s).add(r));
  const removeLoading = (r: Range) => setLoadingRanges((s) => { const n = new Set(s); n.delete(r); return n; });

  const fetchRange = (r: Range, showSpinner: boolean) => {
    if (showSpinner) addLoading(r);
    fetch(`/api/wdim?range=${r}`)
      .then((res) => res.json())
      .then((d: Wdim) => {
        setAvailable(d.available);
        if (d.available) setCache((c) => ({ ...c, [r]: d }));
      })
      .catch(() => setAvailable(false))
      .finally(() => removeLoading(r));
  };

  // On mount: fetch day with spinner, then silently prefetch week + month.
  useEffect(() => {
    if (didPrefetch.current || available === false) return;
    didPrefetch.current = true;
    fetchRange("day", true);
    // Slight delay so the day request gets a head start on the connection.
    const t = setTimeout(() => {
      fetchRange("week", false);
      fetchRange("month", false);
    }, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the user switches to a tab whose prefetch hasn't landed yet, show its spinner.
  useEffect(() => {
    if (available === false || cache[range] || loadingRanges.has(range)) return;
    fetchRange(range, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  if (available === false) return null;

  const data = cache[range];
  const isLoading = loadingRanges.has(range);

  return (
    <section>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left"
        style={{ marginBottom: open ? "0.75rem" : 0, transition: "margin-bottom 250ms ease" }}
        aria-expanded={open}
      >
        <h2 className="text-lg font-medium">What Did I Miss?</h2>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="ml-auto transition-transform duration-200"
          style={{ color: "var(--muted)", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* CSS grid collapse — same trick as CollapsibleSection */}
      <div style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 250ms ease",
        marginTop: open ? -6 : 0,
      }}>
        <div style={{ overflow: "hidden", paddingTop: open ? 6 : 0, paddingBottom: open ? 6 : 0 }}>
          <div className="panel p-4">
            {/* Timeframe tabs */}
            <div className="flex gap-1.5 mb-4 max-md:overflow-x-auto no-scrollbar max-md:-mx-4 max-md:px-4">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setRange(t.id)}
                  className="chip shrink-0 whitespace-nowrap"
                  style={range === t.id ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {isLoading && !data ? (
              <div className="label animate-pulse py-2">synthesising brief…</div>
            ) : data?.sections ? (
              <div className="space-y-5">
                {SECTION_ORDER.map(({ key, label }) => (
                  <SectionBlock key={key} label={label} section={data.sections![key]} />
                ))}
              </div>
            ) : (
              <div className="label py-2">Brief not available — check the claude CLI is installed and logged in.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

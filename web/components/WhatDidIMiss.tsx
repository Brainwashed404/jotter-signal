"use client";
import { useEffect, useRef, useState } from "react";
import { useThoughtStarters, toggleThoughtStarter, thoughtStarterId } from "@/lib/saved";
import { usePersistentToggle } from "@/lib/uiState";

// Client-side mirrors of the server types (lib/wdim.ts is server-only).
type WdimAudience = "b2b" | "b2c";
type WdimRange = "day" | "week" | "month";
type WdimDevelopment = { headline: string; summary: string; url?: string };
type WdimExpertPerspective = { thesis: string; source: string; snippet: string; url?: string };
type WdimDirective = { action: string };
type WdimBriefing = {
  macroIndicator: string;
  developments: WdimDevelopment[];
  expertPerspectives: WdimExpertPerspective[];
  directives: WdimDirective[];
};
type ApiResponse = { available: boolean; briefing?: WdimBriefing };
type CacheKey = string; // `${audience}-${range}`

// ─── Zone label ───────────────────────────────────────────────────────────────

function ZoneLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: "11px",
      fontWeight: 600,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: "var(--muted)",
      marginBottom: "16px",
    }}>{children}</p>
  );
}

// ─── Component A: Unified Control Panel ───────────────────────────────────────

function ControlPanel({
  audience, range,
  onAudienceChange, onRangeChange,
}: {
  audience: WdimAudience;
  range: WdimRange;
  onAudienceChange: (a: WdimAudience) => void;
  onRangeChange: (r: WdimRange) => void;
}) {
  return (
    <div style={{
      padding: "8px 14px",
      borderBottom: "1px solid var(--border)",
      display: "flex",
      flexWrap: "wrap",
      alignItems: "center",
      gap: "8px",
    }}>
      {/* Audience segment selectors */}
      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
        {(["b2b", "b2c"] as WdimAudience[]).map((a) => (
          <button
            key={a}
            onClick={() => onAudienceChange(a)}
            className="chip"
            style={{
              padding: "2px 10px",
              fontSize: "11px",
              fontWeight: audience === a ? 600 : 400,
              letterSpacing: "0.05em",
              ...(audience === a ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}),
            }}
          >
            {a.toUpperCase()}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 14, background: "var(--border)", flexShrink: 0 }} />

      {/* Horizon selectors */}
      <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
        {(["day", "week", "month"] as WdimRange[]).map((r) => (
          <button
            key={r}
            onClick={() => onRangeChange(r)}
            className="chip"
            style={{
              padding: "2px 10px",
              fontSize: "11px",
              ...(range === r ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}),
            }}
          >
            {r === "day" ? "Past Day" : r === "week" ? "Past Week" : "Past Month"}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Component B: Dynamic Macro Indicator ─────────────────────────────────────

function MacroIndicator({ text }: { text: string }) {
  return (
    <div style={{
      padding: "20px 22px",
      background: "color-mix(in srgb, var(--accent) 10%, var(--bg))",
      borderLeft: "4px solid var(--accent)",
      borderRadius: "0 6px 6px 0",
    }}>
      <p style={{ fontSize: "16px", lineHeight: 1.7 }}>{text}</p>
    </div>
  );
}

// ─── Component C: Multi-Story Global Developments Feed ────────────────────────

function DevelopmentsFeed({ developments }: { developments: WdimDevelopment[] }) {
  return (
    <div style={{
      background: "var(--panel-2)",
      borderRadius: "8px",
      padding: "8px 22px",
    }}>
      <div className="divide-y" style={{ borderColor: "color-mix(in srgb, var(--border) 60%, transparent)" }}>
        {developments.map((d, i) => (
          <div key={i} style={{ paddingTop: "18px", paddingBottom: "18px" }}>
            {d.url ? (
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline underline-offset-2"
                style={{
                  display: "block",
                  fontSize: "16px",
                  fontWeight: 600,
                  lineHeight: "1.45",
                  color: "var(--text)",
                }}
              >
                {d.headline}
              </a>
            ) : (
              <p style={{ fontSize: "16px", fontWeight: 600, lineHeight: "1.45" }}>{d.headline}</p>
            )}
            <p style={{ fontSize: "15px", marginTop: "8px", lineHeight: "1.65", color: "var(--muted)" }}>
              {d.summary}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Component D: Expert Synthesis Grid ───────────────────────────────────────

function PerspectiveCard({ p }: { p: WdimExpertPerspective }) {
  const [hover, setHover] = useState(false);
  const content = (
    <>
      <p style={{ fontSize: "15px", fontWeight: 600, lineHeight: "1.45", marginBottom: "8px" }}>
        {p.thesis}
      </p>
      <p style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--muted)" }}>
        {p.source}
        {p.snippet ? <span> · {p.snippet}</span> : null}
      </p>
    </>
  );
  const style: React.CSSProperties = {
    display: "block",
    padding: "16px 18px",
    borderRadius: "6px",
    border: "1px solid var(--border)",
    borderTopWidth: "2px",
    borderTopColor: "var(--accent)",
    // soft accent wash on hover
    background: hover ? "color-mix(in srgb, var(--accent) 12%, var(--panel))" : "var(--panel)",
    transition: "background 150ms ease, border-color 150ms ease",
    textAlign: "left",
    textDecoration: "none",
    color: "inherit",
    cursor: p.url ? "pointer" : "default",
  };
  const handlers = {
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
  };
  return p.url ? (
    <a href={p.url} target="_blank" rel="noopener noreferrer" style={style} {...handlers}>
      {content}
    </a>
  ) : (
    <div style={style} {...handlers}>{content}</div>
  );
}

function ExpertGrid({ perspectives }: { perspectives: WdimExpertPerspective[] }) {
  return (
    <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
      {perspectives.map((p, i) => <PerspectiveCard key={i} p={p} />)}
    </div>
  );
}

// ─── Component E: Thought Starters ────────────────────────────────────────────

function ThoughtStarters({
  directives, savedIds, onToggle,
}: {
  directives: WdimDirective[];
  savedIds: Set<string>;
  onToggle: (action: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      {directives.map((d, i) => {
        const isChecked = savedIds.has(thoughtStarterId(d.action));
        return (
          <button
            key={i}
            onClick={() => onToggle(d.action)}
            title={isChecked ? "Saved to Thought Starters — tick to remove" : "Tick to save to your Thought Starters"}
            style={{
              width: "100%",
              textAlign: "left",
              display: "flex",
              alignItems: "flex-start",
              gap: "14px",
              padding: "16px 18px",
              borderRadius: "7px",
              background: isChecked
                ? "color-mix(in srgb, var(--accent) 8%, var(--bg))"
                : "transparent",
              border: `1px solid ${isChecked
                ? "color-mix(in srgb, var(--accent) 28%, var(--border))"
                : "var(--border)"}`,
              transition: "background 200ms ease, border-color 200ms ease",
              cursor: "pointer",
            }}
          >
            <span style={{ flexShrink: 0, marginTop: "2px", color: isChecked ? "var(--accent)" : "var(--muted)" }}>
              {isChecked ? (
                <svg width="17" height="17" viewBox="0 0 14 14" fill="none">
                  <rect width="14" height="14" rx="2" fill="var(--accent)" />
                  <path
                    d="M3.5 7l2.5 2.5 4.5-4.5"
                    stroke="var(--bg)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2">
                  <rect x="0.5" y="0.5" width="13" height="13" rx="1.5" />
                </svg>
              )}
            </span>
            <span style={{
              fontSize: "15px",
              lineHeight: "1.6",
              color: isChecked ? "var(--muted)" : "var(--text)",
            }}>
              {d.action}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Loading skeleton ──────────────────────────────────────────────────────────

function BriefingSkeleton() {
  return (
    <div className="animate-pulse" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ height: "72px", borderRadius: "6px", background: "var(--border)", opacity: 0.35 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: "60px", borderRadius: "6px", background: "var(--border)", opacity: 0.25 }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: "76px", borderRadius: "6px", background: "var(--border)", opacity: 0.22 }} />
        ))}
      </div>
      <p className="label animate-pulse" style={{ color: "var(--muted)" }}>synthesising brief...</p>
    </div>
  );
}

// ─── Main module ───────────────────────────────────────────────────────────────

export default function WhatDidIMiss() {
  const [open, setOpen] = usePersistentToggle("wdim", true);
  const [audience, setAudience] = useState<WdimAudience>("b2b");
  const [range, setRange] = useState<WdimRange>("day");
  const [cache, setCache] = useState<Record<CacheKey, WdimBriefing>>({});
  const [loadingKeys, setLoadingKeys] = useState<Set<CacheKey>>(new Set());
  const [available, setAvailable] = useState<boolean | null>(null);
  const { ids: savedTsIds } = useThoughtStarters();
  const didPrefetch = useRef(false);

  const cacheKey: CacheKey = `${audience}-${range}`;

  const addLoading = (k: CacheKey) => setLoadingKeys((s) => new Set(s).add(k));
  const removeLoading = (k: CacheKey) =>
    setLoadingKeys((s) => { const n = new Set(s); n.delete(k); return n; });

  const fetchBriefing = async (
    aud: WdimAudience,
    rng: WdimRange,
    showSpinner: boolean,
  ) => {
    const key: CacheKey = `${aud}-${rng}`;
    if (showSpinner) addLoading(key);
    try {
      const params = new URLSearchParams({ range: rng, audience: aud });
      const res = await fetch(`/api/wdim?${params}`);
      const d: ApiResponse = await res.json();
      if (d.available) {
        setAvailable(true);
        if (d.briefing) setCache((prev) => ({ ...prev, [key]: d.briefing! }));
      } else if (showSpinner) {
        setAvailable(false);
      }
    } catch {
      if (showSpinner) setAvailable(false);
    } finally {
      removeLoading(key);
    }
  };

  // Mount: fetch b2b-day (default) with spinner, then silently prefetch week + month.
  useEffect(() => {
    if (didPrefetch.current || available === false) return;
    didPrefetch.current = true;
    fetchBriefing("b2b", "day", true);
    const t = setTimeout(() => {
      fetchBriefing("b2b", "week", false);
      fetchBriefing("b2b", "month", false);
    }, 1500);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On audience or range change: fetch if this combination is not yet cached.
  useEffect(() => {
    if (available === false || cache[cacheKey] || loadingKeys.has(cacheKey)) return;
    fetchBriefing(audience, range, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, range]);

  if (available === false) return null;

  const briefing = cache[cacheKey];
  const isLoading = loadingKeys.has(cacheKey);

  const toggleDirective = (action: string) => {
    toggleThoughtStarter({ text: action, audience, range });
  };

  return (
    <section>
      {/* Module header — collapsible */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 w-full text-left"
        style={{
          paddingBottom: open ? 0 : "0.6rem",
          borderBottom: open ? "none" : "3px solid var(--text)",
          marginBottom: open ? "0.75rem" : 0,
          transition: "margin-bottom 250ms ease",
        }}
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

      {/* CSS grid collapse */}
      <div style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: "grid-template-rows 250ms ease",
        marginTop: open ? -6 : 0,
      }}>
        <div style={{ overflow: "hidden", paddingTop: open ? 6 : 0, paddingBottom: open ? 6 : 0 }}>
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>

            {/* Component A: Control Panel */}
            <ControlPanel
              audience={audience}
              range={range}
              onAudienceChange={setAudience}
              onRangeChange={setRange}
            />

            {/* Briefing content */}
            <div style={{ padding: "26px 24px 30px" }}>
              {isLoading && !briefing ? (
                <BriefingSkeleton />
              ) : briefing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "34px" }}>

                  {/* Zone B: Macro Snapshot */}
                  <div>
                    <ZoneLabel>Macro Snapshot</ZoneLabel>
                    <MacroIndicator text={briefing.macroIndicator} />
                  </div>

                  {/* Zone C: Key Developments */}
                  {briefing.developments.length > 0 && (
                    <div>
                      <ZoneLabel>Key Developments</ZoneLabel>
                      <DevelopmentsFeed developments={briefing.developments} />
                    </div>
                  )}

                  {/* Zone D: Expert Perspectives */}
                  {briefing.expertPerspectives.length > 0 && (
                    <div>
                      <ZoneLabel>Expert Perspectives</ZoneLabel>
                      <ExpertGrid perspectives={briefing.expertPerspectives} />
                    </div>
                  )}

                  {/* Zone E: Thought Starters */}
                  {briefing.directives.length > 0 && (
                    <div>
                      <ZoneLabel>Thought Starters</ZoneLabel>
                      <ThoughtStarters
                        directives={briefing.directives}
                        savedIds={savedTsIds}
                        onToggle={toggleDirective}
                      />
                    </div>
                  )}

                </div>
              ) : (
                <p className="label" style={{ color: "var(--muted)", padding: "4px 0" }}>
                  Brief not available. Check that the claude CLI is installed and logged in.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

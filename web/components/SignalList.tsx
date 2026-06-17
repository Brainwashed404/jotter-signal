"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Signal } from "@/lib/types";
import { SignalCard } from "@/components/SignalCard";

export type Tab = { id: string; label: string };
type Sort = "newest" | "oldest" | "relevance";

// A multi-select dropdown that opens a checkable list (like the All-themes select, but
// multi). Full-width on mobile, anchored popover on desktop. Replaces the old
// chip-wrap panels that the user found messy.
function MultiDropdown({
  label, options, selected, onToggle, onClear, mono = false, align = "left",
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
  mono?: boolean;
  align?: "left" | "right"; // which edge the (wider-than-trigger) list aligns to
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = selected.length > 0;
  const row = "w-full text-left px-3 py-2 text-sm rounded-md flex items-center gap-2 hover:bg-[var(--panel-2)]";
  const tick = (on: boolean) => (
    <span aria-hidden style={{ width: 14, color: "var(--accent)", flexShrink: 0 }}>{on ? "✓" : ""}</span>
  );
  return (
    <div ref={ref} className="relative max-md:w-full">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="btn-ghost text-xs w-full md:w-auto flex items-center justify-between gap-2"
        style={active ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}
      >
        <span className="truncate">{active ? `${label} (${selected.length})` : label}</span>
        <span aria-hidden style={{ color: "var(--muted)", fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className={`absolute z-30 mt-1 ${align === "right" ? "right-0" : "left-0"} min-w-[15rem] md:min-w-[230px] panel p-1 max-h-72 overflow-y-auto no-scrollbar`}>
          <button onClick={onClear} className={row} style={!active ? { color: "var(--accent)" } : {}}>
            {tick(!active)} <span>All {label.toLowerCase()}</span>
          </button>
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button key={o.value} onClick={() => onToggle(o.value)} className={row} style={on ? { color: "var(--accent)" } : {}}>
                {tick(on)} <span className={mono ? "mono" : ""}>{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function SignalList({
  tabs,
  filterBy = "kind",
  themes = [],
  showSearch = false,
  showThemes = false,
  showSort = true,
  showYears = false,
  availableYears = [],
  showExperts = false,
  availableExperts = [],
  searchSuggestions = [],
  initialQuery = "",
  initialType = "",
  initialTheme = "",
  initialExperts = [],
}: {
  tabs: Tab[];
  filterBy?: "type" | "kind";
  themes?: string[];
  showSearch?: boolean;
  showThemes?: boolean;
  showSort?: boolean;
  showYears?: boolean;
  availableYears?: number[];
  showExperts?: boolean;
  availableExperts?: { id: string; name: string }[];
  searchSuggestions?: string[];
  initialQuery?: string;
  initialType?: string;
  initialTheme?: string;
  initialExperts?: string[];
}) {
  const [input, setInput] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [theme, setTheme] = useState(initialTheme);
  const [sort, setSort] = useState<Sort>(initialQuery ? "relevance" : "newest");
  const [years, setYears] = useState<number[]>([]);
  const [experts, setExperts] = useState<string[]>(initialExperts);
  const [filtersOpen, setFiltersOpen] = useState(false); // mobile-only filter drawer
  const [results, setResults] = useState<Signal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const sugSample = (n: number) => {
    const a = [...searchSuggestions];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  };
  // Deterministic initial slice so SSR and hydration match (searchSuggestions is
  // already shuffled per-request server-side). Re-randomised client-side on demand.
  const [suggestions, setSuggestions] = useState<string[]>(() => searchSuggestions.slice(0, 6));

  // Keep the "try" suggestions fresh: reshuffle on mount, then rotate every 8s so the
  // bar never shows the same set for long. (Client-only, so no SSR/hydration mismatch.)
  useEffect(() => {
    if (searchSuggestions.length <= 6) return;
    setSuggestions(sugSample(6));
    const id = setInterval(() => setSuggestions(sugSample(6)), 8000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const committedRef = useRef(initialQuery);
  const typeRef = useRef(type); typeRef.current = type;
  const themeRef = useRef(theme); themeRef.current = theme;
  const sortRef = useRef(sort); sortRef.current = sort;
  const yearsRef = useRef(years); yearsRef.current = years;
  const expertsRef = useRef(experts); expertsRef.current = experts;
  const offsetRef = useRef(0);
  const totalRef = useRef(0);
  const loadingRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    if (!reset && offsetRef.current >= totalRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    const offset = reset ? 0 : offsetRef.current;
    const params = new URLSearchParams();
    if (committedRef.current) params.set("q", committedRef.current);
    if (typeRef.current) params.set(filterBy, typeRef.current);
    if (themeRef.current) params.set("theme", themeRef.current);
    if (yearsRef.current.length) params.set("years", yearsRef.current.join(","));
    if (expertsRef.current.length) params.set("experts", expertsRef.current.join(","));
    params.set("sort", sortRef.current);
    params.set("offset", String(offset));
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    offsetRef.current = offset + data.results.length;
    totalRef.current = data.total;
    setTotal(data.total);
    setResults((prev) => (reset ? data.results : [...prev, ...data.results]));
    setLoading(false);
    loadingRef.current = false;
  }, []);

  // reload from the top when any filter changes
  useEffect(() => { fetchPage(true); }, [type, theme, sort, years.join(","), experts.join(","), fetchPage]);

  // infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting) fetchPage(false); },
      { rootMargin: "500px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [fetchPage]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    committedRef.current = input;
    fetchPage(true);
    setSuggestions(sugSample(6)); // always offer fresh suggestions after a search
  }

  function clearSearch() {
    setInput("");
    committedRef.current = "";
    fetchPage(true);
    setSuggestions(sugSample(6));
  }

  function toggleYear(y: number) {
    setYears((prev) => (prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y]));
  }
  function toggleExpert(id: string) {
    setExperts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const hasMore = results.length < total;
  const activeCount = (theme ? 1 : 0) + (experts.length ? 1 : 0) + (years.length ? 1 : 0);
  const hasControls = tabs.length > 1 || showThemes || showExperts || showYears || showSort;

  return (
    <div className="space-y-5">
      {showSearch && (
        <form onSubmit={submit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={suggestions.length ? `Search the signal: e.g. ${suggestions.slice(0, 3).join(", ")}…` : "Search the signal…"}
              className="w-full px-4 py-2.5 pr-10 text-sm"
            />
            {input && (
              <button
                type="button"
                onClick={clearSearch}
                title="Clear"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none"
                style={{ color: "var(--muted)" }}
              >
                ✕
              </button>
            )}
          </div>
          <button className="btn" type="submit">Search</button>
        </form>
      )}

      {/* Mobile: a single Filters button reveals the tabs + controls (default view is
          just the search bar + feed). Desktop shows everything inline as before. */}
      {hasControls && (
        <button
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          className="md:hidden text-sm w-full flex items-center gap-2 px-1 py-1"
          style={{ color: activeCount ? "var(--accent)" : "var(--muted)" }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" />
          </svg>
          <span>Filters{activeCount ? ` (${activeCount})` : ""}</span>
          <span className="ml-auto">{filtersOpen ? "▲" : "▼"}</span>
        </button>
      )}

      <div className={`flex flex-wrap gap-2 items-center ${filtersOpen ? "" : "max-md:hidden"}`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className="chip max-md:flex-1 max-md:text-center"
            style={type === t.id ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
          >
            {t.label}
          </button>
        ))}
        {/* Controls: inline + right-aligned on desktop; a 2-col grid filling the width
            on mobile (themes · experts / years · sort). Every control carries the same
            ▼ chevron (native select arrows are hidden via appearance-none). */}
        <div className="ml-auto flex flex-wrap gap-2 items-center max-md:ml-0 max-md:w-full max-md:grid max-md:grid-cols-2">
          {showThemes && (
            <div className="relative max-md:w-full">
              <select value={theme} onChange={(e) => setTheme(e.target.value)} className="btn-ghost text-xs w-full appearance-none pr-7"
                style={theme ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
                <option value="">All themes</option>
                {themes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span aria-hidden className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted)", fontSize: 10 }}>▼</span>
            </div>
          )}
          {showExperts && availableExperts.length > 1 && (
            <MultiDropdown
              label="Experts"
              align="right"
              options={availableExperts.map((e) => ({ value: e.id, label: e.name }))}
              selected={experts}
              onToggle={toggleExpert}
              onClear={() => setExperts([])}
            />
          )}
          {showYears && availableYears.length > 0 && (
            <MultiDropdown
              label="Years"
              mono
              align="left"
              options={availableYears.map((y) => ({ value: String(y), label: String(y) }))}
              selected={years.map(String)}
              onToggle={(v) => toggleYear(Number(v))}
              onClear={() => setYears([])}
            />
          )}
          {showSort && (
            <div className="relative max-md:w-full">
              <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="btn-ghost text-xs w-full appearance-none pr-7">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="relevance">Most relevant</option>
              </select>
              <span aria-hidden className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--muted)", fontSize: 10 }}>▼</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {results.map((s) => <SignalCard key={s.id} s={s} />)}
      </div>

      <div ref={sentinel} className="h-10 grid place-items-center label">
        {loading ? "loading more…" : hasMore ? "scroll for more" : results.length > 0 ? "— end —" : "no matches"}
      </div>
    </div>
  );
}

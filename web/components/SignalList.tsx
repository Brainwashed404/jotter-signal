"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Signal } from "@/lib/types";
import { SignalCard } from "@/components/SignalCard";

export type Tab = { id: string; label: string };
type Sort = "newest" | "oldest" | "relevance";

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
  const [yearsOpen, setYearsOpen] = useState(false);
  const [experts, setExperts] = useState<string[]>(initialExperts);
  const [expertsOpen, setExpertsOpen] = useState(false);
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

  function runSearch(term: string) {
    setInput(term);
    committedRef.current = term;
    setSort("relevance"); sortRef.current = "relevance";
    fetchPage(true);
    setSuggestions(sugSample(6));
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

  return (
    <div className="space-y-5">
      {showSearch && (
        <form onSubmit={submit} className="flex gap-2">
          <div className="relative flex-1">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={suggestions.length ? `Search the signal: e.g. ${suggestions.slice(0, 3).join(", ")}…` : "Search the signal…"}
              className="w-full px-4 py-3 pr-10 text-sm"
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

      <div className="flex flex-wrap gap-2 items-center">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className="chip"
            style={type === t.id ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex gap-2 items-center">
          {showThemes && (
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="btn-ghost text-xs"
              style={theme ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
              <option value="">All themes</option>
              {themes.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
          {showExperts && availableExperts.length > 1 && (
            <button onClick={() => setExpertsOpen((o) => !o)} className="btn-ghost text-xs"
              style={experts.length ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
              {experts.length ? `Experts (${experts.length})` : "Select experts"} {expertsOpen ? "▲" : "▼"}
            </button>
          )}
          {showYears && availableYears.length > 0 && (
            <button onClick={() => setYearsOpen((o) => !o)} className="btn-ghost text-xs"
              style={years.length ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
              {years.length ? `Years (${years.length})` : "Select years"} {yearsOpen ? "▲" : "▼"}
            </button>
          )}
          {showSort && (
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="btn-ghost text-xs">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="relevance">Most relevant</option>
            </select>
          )}
        </div>
      </div>

      {showExperts && expertsOpen && availableExperts.length > 1 && (
        <div className="panel p-3 flex flex-wrap gap-1.5 items-center">
          <button
            onClick={() => setExperts([])}
            className="chip"
            style={experts.length === 0 ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
          >
            All experts
          </button>
          {availableExperts.map((e) => (
            <button
              key={e.id}
              onClick={() => toggleExpert(e.id)}
              className="chip"
              style={experts.includes(e.id) ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}

      {showYears && yearsOpen && availableYears.length > 0 && (
        <div className="panel p-3 flex flex-wrap gap-1.5 items-center">
          <button
            onClick={() => setYears([])}
            className="chip"
            style={years.length === 0 ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
          >
            All years
          </button>
          {availableYears.map((y) => (
            <button
              key={y}
              onClick={() => toggleYear(y)}
              className="chip mono"
              style={years.includes(y) ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
            >
              {y}
            </button>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        {results.map((s) => <SignalCard key={s.id} s={s} />)}
      </div>

      <div ref={sentinel} className="h-10 grid place-items-center label">
        {loading ? "loading more…" : hasMore ? "scroll for more" : results.length > 0 ? "— end —" : "no matches"}
      </div>
    </div>
  );
}

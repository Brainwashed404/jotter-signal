"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Signal } from "@/lib/types";
import { SignalCard } from "@/components/SignalCard";

export type Tab = { id: string; label: string };
type Sort = "newest" | "oldest" | "relevance";

export default function SignalList({
  tabs,
  themes = [],
  showSearch = false,
  showThemes = false,
  showSort = true,
  showYears = false,
  availableYears = [],
  showExperts = false,
  availableExperts = [],
  initialQuery = "",
  initialType = "",
  initialTheme = "",
  initialExperts = [],
}: {
  tabs: Tab[];
  themes?: string[];
  showSearch?: boolean;
  showThemes?: boolean;
  showSort?: boolean;
  showYears?: boolean;
  availableYears?: number[];
  showExperts?: boolean;
  availableExperts?: { id: string; name: string }[];
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
  const [trending, setTrending] = useState<{ term: string; n: number }[]>([]);

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
    if (typeRef.current) params.set("type", typeRef.current);
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

  // trending topics from the news (Search only)
  useEffect(() => {
    if (!showSearch) return;
    fetch("/api/trending").then((r) => r.json()).then((d) => setTrending(d.topics || [])).catch(() => {});
  }, [showSearch]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    committedRef.current = input;
    fetchPage(true);
  }

  function searchFor(term: string) {
    setInput(term);
    committedRef.current = term;
    setSort("relevance"); sortRef.current = "relevance";
    fetchPage(true);
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
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search the signal — e.g. AI bubble, surveillance capitalism, democratic backsliding…"
            className="flex-1 px-4 py-3 text-sm"
          />
          <button className="btn" type="submit">Search</button>
        </form>
      )}

      {showSearch && trending.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="label">Trending in the news:</span>
          {trending.map((t) => (
            <button key={t.term} onClick={() => searchFor(t.term)} className="chip" title={`Search the archive for “${t.term}”`}>
              {t.term}
            </button>
          ))}
        </div>
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
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="text-xs px-2 py-1.5">
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
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="text-xs px-2 py-1.5">
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

      <div className="label">
        {total.toLocaleString()} signals · showing {results.length.toLocaleString()}
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

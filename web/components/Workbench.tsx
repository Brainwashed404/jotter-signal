"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import type { Signal } from "@/lib/types";
import { SignalCard } from "@/components/SignalCard";

const TYPES = ["", "longread", "quote", "commonplace", "book", "linkblog", "note"];
const TYPE_LABEL: Record<string, string> = {
  "": "All", longread: "Long Reads", quote: "Quotes", commonplace: "Commonplace",
  book: "Books", linkblog: "Linkblog", note: "Notes",
};

export default function Workbench({
  themes,
  initialQuery = "",
  initialType = "",
}: {
  themes: string[];
  initialQuery?: string;
  initialType?: string;
}) {
  const [input, setInput] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [theme, setTheme] = useState("");
  const [results, setResults] = useState<Signal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  // refs read by the stable fetcher (avoids stale closures in the observer)
  const committedRef = useRef(initialQuery);
  const typeRef = useRef(type); typeRef.current = type;
  const themeRef = useRef(theme); themeRef.current = theme;
  const offsetRef = useRef(0);
  const totalRef = useRef(0);
  const loadingRef = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const fetchPage = useCallback(async (reset: boolean) => {
    if (loadingRef.current) return;
    if (!reset && offsetRef.current >= totalRef.current) return; // nothing more
    loadingRef.current = true;
    setLoading(true);
    const offset = reset ? 0 : offsetRef.current;
    const params = new URLSearchParams();
    if (committedRef.current) params.set("q", committedRef.current);
    if (typeRef.current) params.set("type", typeRef.current);
    if (themeRef.current) params.set("theme", themeRef.current);
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

  // reload from the top when filters change (and on mount)
  useEffect(() => { fetchPage(true); }, [type, theme, fetchPage]);

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
  }

  const hasMore = results.length < total;

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search the signal — e.g. AI bubble, surveillance capitalism, democratic backsliding…"
          className="flex-1 px-4 py-3 text-sm"
        />
        <button className="btn" type="submit">Search</button>
      </form>

      <div className="flex flex-wrap gap-2 items-center">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => setType(t)}
            className="chip"
            style={type === t ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
          >
            {TYPE_LABEL[t]}
          </button>
        ))}
        <select value={theme} onChange={(e) => setTheme(e.target.value)} className="text-xs px-2 py-1.5 ml-auto">
          <option value="">All themes</option>
          {themes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="label">
        {total.toLocaleString()} matching signals · showing {results.length.toLocaleString()}
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

"use client";
import { useEffect, useState, useCallback } from "react";
import type { Signal } from "@/lib/data";
import { SignalCard } from "@/components/ui";

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
  const [q, setQ] = useState(initialQuery);
  const [type, setType] = useState(initialType);
  const [theme, setTheme] = useState("");
  const [results, setResults] = useState<Signal[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const run = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    if (theme) params.set("theme", theme);
    const res = await fetch(`/api/search?${params}`);
    const data = await res.json();
    setResults(data.results);
    setTotal(data.total);
    setLoading(false);
  }, [q, type, theme]);

  useEffect(() => { run(); /* eslint-disable-next-line */ }, [type, theme]);

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => { e.preventDefault(); run(); }}
        className="flex gap-2"
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
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
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          className="text-xs px-2 py-1.5 ml-auto"
        >
          <option value="">All themes</option>
          {themes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="label">
        {loading ? "searching…" : `${total.toLocaleString()} matching signals`}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {results.map((s) => <SignalCard key={s.id} s={s} />)}
      </div>
    </div>
  );
}

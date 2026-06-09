"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Topic = { title: string; url: string; source: string; term: string; context?: string };

const CATEGORIES = [
  { id: "uk", label: "UK" },
  { id: "world", label: "World" },
  { id: "business", label: "Business" },
  { id: "politics", label: "Politics" },
  { id: "technology", label: "Tech" },
  { id: "futurology", label: "Futurism" },
  { id: "hn", label: "HN" },
  { id: "guardian", label: "Guardian" },
  { id: "ft", label: "Money" },
  { id: "reuters", label: "Reuters" },
  { id: "bbc", label: "BBC" },
  { id: "timeout", label: "Time Out" },
  { id: "reddit", label: "Reddit" },
  { id: "wikipedia", label: "Wiki" },
  { id: "github", label: "GitHub" },
  { id: "google", label: "Google" },
];

const CAT_KEY = "jotter.news.category";
const ORDER_KEY = "jotter.news.order";
const LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.label]));

export default function TrendingWidget() {
  const [category, setCategory] = useState("technology");
  const [order, setOrder] = useState<string[]>(CATEGORIES.map((c) => c.id));
  const [dragId, setDragId] = useState<string | null>(null); // for the drag visual
  const dragIdRef = useRef<string | null>(null);             // for reorder logic (synchronous)
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [cache, setCache] = useState<Record<string, Topic[]>>({});

  // Restore the last-viewed pill + saved pill order (client-only, so no SSR/hydration mismatch).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(CAT_KEY);
      if (saved && CATEGORIES.some((c) => c.id === saved)) setCategory(saved);
    } catch { /* ignore */ }
    try {
      const raw = JSON.parse(localStorage.getItem(ORDER_KEY) || "null");
      if (Array.isArray(raw)) {
        const known = new Set(CATEGORIES.map((c) => c.id));
        const merged = raw.filter((id: string) => known.has(id));
        for (const c of CATEGORIES) if (!merged.includes(c.id)) merged.push(c.id); // append any new pills
        setOrder(merged);
      }
    } catch { /* ignore */ }
  }, []);

  // Persist + switch when a pill is chosen.
  const choose = (id: string) => {
    setCategory(id);
    try { localStorage.setItem(CAT_KEY, id); } catch { /* ignore */ }
  };

  // Drag a pill onto another to reorder; persisted so the layout sticks.
  const startDrag = (id: string) => { dragIdRef.current = id; setDragId(id); };
  const endDrag = () => { dragIdRef.current = null; setDragId(null); };
  const dropOn = (targetId: string) => {
    const from = dragIdRef.current;
    if (!from || from === targetId) return;
    setOrder((cur) => {
      const a = cur.filter((x) => x !== from);
      a.splice(a.indexOf(targetId), 0, from);
      try { localStorage.setItem(ORDER_KEY, JSON.stringify(a)); } catch { /* ignore */ }
      return a;
    });
  };

  useEffect(() => {
    let cancelled = false;
    async function load(force: boolean) {
      if (!force && cache[category]) { setTopics(cache[category]); setLoading(false); return; }
      if (!force) setLoading(true);
      try {
        // Reddit uses a dedicated edge-function endpoint (runs on Cloudflare IPs, not AWS,
        // so it isn't subject to Reddit's datacenter IP block).
        const url = category === "reddit" ? "/api/reddit" : `/api/trending?category=${category}`;
        const d = await (await fetch(url, { cache: "no-store" })).json();
        if (cancelled) return;
        const t = d.topics || [];
        setTopics(t);
        setCache((c) => ({ ...c, [category]: t }));
      } catch { /* keep previous */ }
      finally { if (!cancelled) setLoading(false); }
    }
    load(false);
    // keep the news box fresh: re-pull the current category every 2 minutes
    const id = setInterval(() => load(true), 2 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [category, cache]);

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {order.map((id) => (
          <button
            key={id}
            draggable
            onDragStart={() => startDrag(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); dropOn(id); }}
            onDragEnd={endDrag}
            onClick={() => choose(id)}
            title="Drag to reorder"
            className="chip cursor-grab active:cursor-grabbing select-none"
            style={{
              ...(category === id ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}),
              opacity: dragId === id ? 0.4 : 1,
            }}
          >
            {LABELS[id]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="label animate-pulse py-1">loading headlines…</div>
      ) : topics.length === 0 ? (
        <div className="label py-1">No headlines right now.</div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {topics.map((t, i) => (
            <li key={i} className="flex items-center gap-2 text-[13px] py-1">
              <div className="flex-1 min-w-0 truncate">
                <a href={t.url} target="_blank" rel="noopener" className="hover:underline">{t.title}</a>
                {t.context && <span className="ml-1.5" style={{ color: "var(--muted)" }}>· {t.context}</span>}
              </div>
              <span className="label shrink-0">{t.source}</span>
              {/* Search the archive for the WHOLE headline (searchSignals strips stopwords + ranks by
                  overlap), so it brings the wider context, not just the first name in the title. */}
              <Link
                href={`/search?q=${encodeURIComponent((t.source === "Wikipedia" || t.source === "GitHub") && t.term ? t.term : t.title)}`}
                className="shrink-0 grid place-items-center w-7 h-7 rounded-md transition-colors hover:bg-[var(--panel-2)]"
                style={{ color: "var(--accent)" }}
                title="Search the intelligence archive for this story"
                aria-label="Search the archive for this story"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SwipeView, centerActivePill } from "@/components/SwipeView";

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

  // Touch drag state for mobile pill reorder
  const touchSrc = useRef<string | null>(null);
  const touchOver = useRef<string | null>(null);
  const touchDidDrag = useRef(false);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const suppressNextClick = useRef(false);
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

  // Direction of the last category change, so the slide-in animation comes from the
  // correct side whether you swiped or tapped a pill.
  const [slideDir, setSlideDir] = useState(1);

  // Keep the active category pill scrolled into view as you swipe/tap through pages.
  const pillsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    centerActivePill(pillsRef.current, (el) => el.dataset.pillId === category);
  }, [category, order]);

  // Persist + switch when a pill is chosen.
  const choose = (id: string) => {
    setSlideDir(order.indexOf(id) >= order.indexOf(category) ? 1 : -1);
    setCategory(id);
    try { localStorage.setItem(CAT_KEY, id); } catch { /* ignore */ }
  };

  // Drag a pill onto another to reorder; persisted so the layout sticks.
  const startDrag = (id: string) => { dragIdRef.current = id; setDragId(id); };
  const endDrag = () => { dragIdRef.current = null; setDragId(null); };

  // Touch drag handlers for mobile pill reorder (HTML5 drag events don't fire on touch).
  function onPillTouchStart(e: React.TouchEvent, id: string) {
    touchSrc.current = id;
    touchOver.current = null;
    touchDidDrag.current = false;
    touchOrigin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function onPillTouchMove(e: React.TouchEvent) {
    if (!touchSrc.current || !touchOrigin.current) return;
    const t = e.touches[0];
    const moved = Math.abs(t.clientX - touchOrigin.current.x) > 10 || Math.abs(t.clientY - touchOrigin.current.y) > 10;
    if (!moved) return;
    touchDidDrag.current = true;
    if (dragId !== touchSrc.current) setDragId(touchSrc.current);
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const pill = el?.closest("[data-pill-id]") as HTMLElement | null;
    touchOver.current = pill?.dataset.pillId ?? null;
  }
  function onPillTouchEnd() {
    if (touchDidDrag.current && touchSrc.current && touchOver.current && touchOver.current !== touchSrc.current) {
      dragIdRef.current = touchSrc.current;
      dropOn(touchOver.current);
      suppressNextClick.current = true;
    }
    touchSrc.current = null;
    touchOver.current = null;
    touchDidDrag.current = false;
    setDragId(null);
  }

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
        const d = await (await fetch(`/api/trending?category=${category}`, { cache: "no-store" })).json();
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
      {/* ≤md: one swipeable row (like the Markets ticker); ≥md: wrap as before */}
      <div ref={pillsRef} className="flex flex-wrap gap-1.5 mb-3 max-md:flex-nowrap max-md:overflow-x-auto no-scrollbar max-md:-mx-4 max-md:px-4">
        {order.map((id) => (
          <button
            key={id}
            data-pill-id={id}
            draggable
            onDragStart={() => startDrag(id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); dropOn(id); }}
            onDragEnd={endDrag}
            onTouchStart={(e) => onPillTouchStart(e, id)}
            onTouchMove={onPillTouchMove}
            onTouchEnd={onPillTouchEnd}
            onClick={() => {
              if (suppressNextClick.current) { suppressNextClick.current = false; return; }
              choose(id);
            }}
            title="Drag to reorder"
            className="chip cursor-grab active:cursor-grabbing select-none shrink-0 whitespace-nowrap"
            style={{
              ...(category === id ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}),
              opacity: dragId === id ? 0.4 : 1,
            }}
          >
            {LABELS[id]}
          </button>
        ))}
      </div>

      <SwipeView
        pageKey={category}
        dir={slideDir}
        hasPrev={order.indexOf(category) > 0}
        hasNext={order.indexOf(category) < order.length - 1}
        onPrev={() => { const i = order.indexOf(category); if (i > 0) { setSlideDir(-1); choose(order[i - 1]); } }}
        onNext={() => { const i = order.indexOf(category); if (i < order.length - 1) { setSlideDir(1); choose(order[i + 1]); } }}
      >
      {loading ? (
        <div className="label animate-pulse py-1">loading headlines…</div>
      ) : topics.length === 0 ? (
        <div className="label py-1">No headlines right now.</div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {topics.map((t, i) => (
            <li key={i} className={`flex items-center max-md:items-start gap-2 text-[13px] py-1 max-md:py-1.5${i >= 5 ? " max-md:hidden" : ""}`}>
              {/* ≤md: headline clamps to two lines with the source label beneath it;
                  ≥md: single truncated line with source + search inline (unchanged) */}
              <div className="flex-1 min-w-0">
                <div className="md:truncate max-md:line-clamp-2">
                  <a href={t.url} target="_blank" rel="noopener" className="hover:underline">{t.title}</a>
                  {t.context && <span className="ml-1.5" style={{ color: "var(--muted)" }}>· {t.context}</span>}
                </div>
                <span className="label block md:hidden mt-0.5">{t.source}</span>
              </div>
              <span className="label shrink-0 max-md:hidden">{t.source}</span>
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
      </SwipeView>
    </div>
  );
}

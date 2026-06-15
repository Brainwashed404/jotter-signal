"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { STATIONS, GENRES, type Station } from "@/lib/stations";

const FAV_KEY          = "jotter.radio.favs";
const LAST_STATION_KEY = "jotter.radio.last-station.v1";
const LAST_SRC_KEY     = "jotter.radio.last-src.v1";

// Sort keys that spell out leading numbers so they file under the right letter.
const SORT_OVERRIDES: Record<string, string> = {
  "20FT Radio": "twenty foot radio",
  "70s 80s Disco Funk": "seventies eighties disco funk",
};
// Sort key: spell out leading numbers, and ignore a leading "The" (so "The Velvet
// Underground" files under V, "The Lot Radio" under L, etc.).
const sortKey = (name: string) => (SORT_OVERRIDES[name] ?? name).toLowerCase().replace(/^the\s+/, "");
const SORTED = [...STATIONS].sort((a, b) => sortKey(a.name).localeCompare(sortKey(b.name), "en", { sensitivity: "base" }));

const ACR: Record<string, string> = { ukg: "UKG", dnb: "DnB", rnb: "RnB" };
function sentence(g: string): string {
  return g.toLowerCase().split(" ").map((w) => ACR[w] ?? (w === "+" ? "+" : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}
const shortUrl = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, ""); } };

function Icon({ name, size = 18 }: { name: "play" | "pause" | "prev" | "next" | "shuffle" | "chevL" | "chevR" | "ext" | "gear"; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (name === "gear") return <svg {...p} className="gear-icon"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
  if (name === "play") return <svg {...p} fill="currentColor" stroke="none"><polygon points="7 4 20 12 7 20 7 4" /></svg>;
  if (name === "pause") return <svg {...p} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>;
  if (name === "prev") return <svg {...p}><polygon points="19 20 9 12 19 4" fill="currentColor" stroke="none" /><line x1="6" y1="5" x2="6" y2="19" /></svg>;
  if (name === "next") return <svg {...p}><polygon points="5 4 15 12 5 20" fill="currentColor" stroke="none" /><line x1="18" y1="5" x2="18" y2="19" /></svg>;
  if (name === "shuffle") return <svg {...p}><polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" /><polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" /><line x1="4" y1="4" x2="9" y2="9" /></svg>;
  if (name === "chevL") return <svg {...p}><polyline points="15 18 9 12 15 6" /></svg>;
  if (name === "ext") return <svg {...p}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="8 7 17 7 17 16" /></svg>;
  return <svg {...p}><polyline points="9 18 15 12 9 6" /></svg>;
}

export default function RadioSidebar() {
  const [open, setOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false); // mobile bottom sheet
  const [current, setCurrent] = useState<Station | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [shuffleOn, setShuffleOn] = useState(true); // shuffle is on by default on every launch
  const [activeSrc, setActiveSrc] = useState("");
  const [view, setView] = useState<"index" | "favs">("index");
  const [genresOpen, setGenresOpen] = useState(true);
  const [listOpen, setListOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [favs, setFavs] = useState<string[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => { try { setFavs(JSON.parse(localStorage.getItem(FAV_KEY) || "[]")); } catch {} }, []);
  useEffect(() => { try { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); } catch {} }, [favs]);

  // Restore last station + genre on mount (don't auto-play — browser blocks without user gesture)
  useEffect(() => {
    try {
      const lastSrc = localStorage.getItem(LAST_SRC_KEY);
      if (lastSrc) setActiveSrc(lastSrc);
      const lastName = localStorage.getItem(LAST_STATION_KEY);
      if (lastName) {
        const s = SORTED.find((x) => x.name === lastName);
        if (s) setCurrent(s);
      }
    } catch {}
  }, []);

  function ensureAudio(): HTMLAudioElement {
    if (!audioRef.current) {
      const a = new Audio();
      a.preload = "none";
      a.addEventListener("playing", () => { setPlaying(true); setError(false); });
      a.addEventListener("pause", () => setPlaying(false));
      a.addEventListener("error", () => { setError(true); setPlaying(false); });
      audioRef.current = a;
    }
    return audioRef.current;
  }
  // `queue` is the active playlist the transport (play/next/prev/shuffle) walks.
  // Choosing a genre / favourites / a list row sets the queue, so next & prev
  // stay within that context.
  const [queue, setQueue] = useState<Station[]>(SORTED);
  function play(s: Station, q?: Station[]) {
    const a = ensureAudio();
    setCurrent(s); setError(false);
    if (q && q.length) setQueue(q);
    a.src = s.url; a.play().catch(() => setError(true));
    try { localStorage.setItem(LAST_STATION_KEY, s.name); } catch {}
  }
  function shuffleSource(src: string) {
    setActiveSrc(src);
    try { localStorage.setItem(LAST_SRC_KEY, src); } catch {};
    setView(src === "favs" ? "favs" : "index"); // a genre/all selection drives the Index list
    const list = src === "all" ? SORTED : src === "favs" ? SORTED.filter((s) => favs.includes(s.name)) : SORTED.filter((s) => s.genre === src);
    if (list.length) play(list[Math.floor(Math.random() * list.length)], list);
  }
  function toggleShuffle() {
    const n = !shuffleOn; setShuffleOn(n);
    if (n) { const list = queue.length ? queue : SORTED; if (list.length) play(list[Math.floor(Math.random() * list.length)], list); }
  }
  // Switching Index/Favourites also sets the playback context the transport walks.
  function chooseView(v: "index" | "favs") {
    setView(v);
    const list = v === "favs" ? SORTED.filter((s) => favs.includes(s.name)) : SORTED;
    setQueue(list); setActiveSrc(v === "favs" ? "favs" : "all");
  }
  function step(dir: 1 | -1) {
    const list = queue.length ? queue : SORTED;
    if (shuffleOn) { play(list[Math.floor(Math.random() * list.length)], list); return; }
    if (!current) { play(list[0], list); return; }
    let i = list.findIndex((s) => s.name === current.name);
    i = i < 0 ? 0 : (i + dir + list.length) % list.length;
    play(list[i], list);
  }
  function togglePlay() {
    const a = audioRef.current;
    if (!current) { shuffleSource("all"); return; }
    if (!a) { play(current); return; }
    if (a.paused) a.play().catch(() => setError(true)); else a.pause();
  }
  const toggleFav = (name: string) => setFavs((f) => (f.includes(name) ? f.filter((x) => x !== name) : [...f, name]));

  // Media keys via the Media Session API (kept fresh via a ref).
  const fns = useRef({ togglePlay, step, pause: () => audioRef.current?.pause() });
  fns.current = { togglePlay, step, pause: () => audioRef.current?.pause() };
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => fns.current.togglePlay());
    ms.setActionHandler("pause", () => fns.current.pause());
    ms.setActionHandler("nexttrack", () => fns.current.step(1));
    ms.setActionHandler("previoustrack", () => fns.current.step(-1));
    return () => ["play", "pause", "nexttrack", "previoustrack"].forEach((a) => ms.setActionHandler(a as MediaSessionAction, null));
  }, []);
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    if (current && "MediaMetadata" in window) navigator.mediaSession.metadata = new MediaMetadata({ title: current.name, artist: sentence(current.genre), album: "Jotter Radio" });
  }, [current, playing]);

  // Scroll the playing station to the top of the list (without reordering it).
  // Scrolls ONLY the radio's own list container — never the page/main feed.
  const activeRowRef = useRef<HTMLLIElement | null>(null);
  const listScrollRef = useRef<HTMLUListElement | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  // The sidebar is its own scroll territory: wheeling anywhere over it must NOT
  // scroll the main feed. Only the station list scrolls (internally).
  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const sc = listScrollRef.current;
      if (sc && sc.contains(e.target as Node)) {
        const atTop = sc.scrollTop <= 0 && e.deltaY < 0;
        const atBottom = sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 1 && e.deltaY > 0;
        if (atTop || atBottom) e.preventDefault(); // don't chain to the page at the edges
        return; // otherwise let the list scroll
      }
      e.preventDefault(); // over the fixed areas (transport, genres) → swallow it
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  useEffect(() => {
    const el = activeRowRef.current, sc = listScrollRef.current;
    if ((listOpen || query.trim()) && current && el && sc) {
      const delta = el.getBoundingClientRect().top - sc.getBoundingClientRect().top;
      sc.scrollTo({ top: sc.scrollTop + delta, behavior: "smooth" });
    }
  }, [current, listOpen, view, query]);

  // Mobile wiring: the header radio button toggles the sheet (window event),
  // and we broadcast playing state back so that button can light up.
  useEffect(() => {
    const toggleSheet = () => setSheetOpen((o) => !o);
    window.addEventListener("jotter-radio-toggle", toggleSheet);
    return () => window.removeEventListener("jotter-radio-toggle", toggleSheet);
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("jotter-radio-state", { detail: { playing, station: current?.name ?? null } }));
  }, [playing, current]);
  // Lock page scroll behind the open sheet
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [sheetOpen]);

  const favStations = SORTED.filter((s) => favs.includes(s.name));
  const q = query.trim().toLowerCase();
  // In Index view, a highlighted genre filters the list to that genre; "All" shows everything.
  const genreFilter = view === "index" && activeSrc && activeSrc !== "all" && activeSrc !== "favs" ? activeSrc : null;
  const base = view === "favs" ? favStations : genreFilter ? SORTED.filter((s) => s.genre === genreFilter) : SORTED;
  // match the start of the station name only (e.g. "n" → NTS…, not …Franklin)
  const listed = q ? base.filter((s) => s.name.toLowerCase().startsWith(q)) : base;

  // Render helper (NOT a component): returns the <li> directly so the list reconciles
  // in place by key. Defining this as a <Row/> component inside the body gave it a fresh
  // identity every render, which remounted the whole <ul> on any state change (e.g. a
  // favourite toggle) and reset the scroll position to the top.
  const renderRow = (s: Station) => {
    const active = current?.name === s.name;
    return (
      <li key={s.name} ref={active ? activeRowRef : undefined}>
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] cursor-pointer hover:bg-[var(--panel-2)]" onClick={() => play(s, base)}>
          <span className="flex-1 truncate" title={`${sentence(s.genre)} — ${s.desc}`} style={active ? { color: "var(--accent)" } : {}}>{s.name}</span>
          {s.sourceUrl && (
            <a href={s.sourceUrl} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} title="Open station website" className="shrink-0" style={{ color: "var(--muted)" }}><Icon name="ext" size={13} /></a>
          )}
          <button onClick={(e) => { e.stopPropagation(); toggleFav(s.name); }} className="shrink-0 text-sm leading-none" style={{ color: favs.includes(s.name) ? "var(--accent)" : "var(--muted)" }}>{favs.includes(s.name) ? "★" : "☆"}</button>
        </div>
      </li>
    );
  };

  // Genre buttons + "Favourites" (only when you have any), all sorted alphabetically
  // so Favourites naturally files under F (just below Eclectic Electric).
  const genreItems = [
    ...GENRES.map((g) => ({ key: g, label: sentence(g) })),
    ...(favs.length ? [{ key: "favs", label: "Favourites" }] : []),
  ].sort((a, b) => a.label.localeCompare(b.label));

  const iconBtn = "w-8 h-8 grid place-items-center rounded-lg";

  return (
    <>
    <aside ref={asideRef} className="max-md:hidden sticky top-0 h-screen shrink-0 relative overflow-hidden transition-[width] duration-300 ease-in-out"
      style={{ width: open ? 264 : 48, borderRight: "1px solid var(--border)", background: "var(--bg)" }}>

      {/* expanded panel (fixed width so it doesn't reflow during the width animation) */}
      <div className="w-[264px] h-screen flex flex-col transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}>

        {/* classic transport — matches the top nav background in every skin */}
        <div className="flex items-center gap-1 px-3 h-14 shrink-0" style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => step(-1)} className={iconBtn} title="Previous" style={{ color: "var(--muted)" }}><Icon name="prev" /></button>
          <button onClick={togglePlay} title={playing ? "Pause" : "Play"} className="w-10 h-10 rounded-full grid place-items-center" style={{ background: "var(--accent)", color: "var(--bg)" }}><Icon name={playing ? "pause" : "play"} /></button>
          <button onClick={() => step(1)} className={iconBtn} title="Next" style={{ color: "var(--muted)" }}><Icon name="next" /></button>
          <button onClick={toggleShuffle} className={iconBtn} title="Shuffle" style={{ color: shuffleOn ? "var(--accent)" : "var(--muted)" }}><Icon name="shuffle" /></button>
          <button onClick={() => setOpen(false)} title="Collapse" className="ml-auto" style={{ color: "var(--muted)" }}><Icon name="chevL" size={16} /></button>
        </div>

        {/* now playing */}
        <div className="px-3 py-2.5 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm leading-snug truncate" style={current ? { color: "var(--accent)" } : {}}>{current ? current.name : "Pick a genre or station"}</div>
              {current && (error ? (
                <div className="label mt-0.5" style={{ color: "var(--down)" }}>stream unavailable</div>
              ) : current.sourceUrl ? (
                <a href={current.sourceUrl} target="_blank" rel="noopener" className="label mt-0.5 inline-flex items-center gap-1 hover:underline truncate" style={{ color: "var(--accent-2)", textTransform: "none", letterSpacing: 0 }}>{shortUrl(current.sourceUrl)} <Icon name="ext" size={11} /></a>
              ) : null)}
            </div>
            {current && <button onClick={() => toggleFav(current.name)} title="Favourite" className="text-lg shrink-0 leading-none" style={{ color: favs.includes(current.name) ? "var(--accent)" : "var(--muted)" }}>{favs.includes(current.name) ? "★" : "☆"}</button>}
          </div>
        </div>

        {/* Genres — fixed (collapsible); never scrolls away */}
        <div className="shrink-0 px-3 pt-3 pb-2" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={() => setGenresOpen((o) => !o)} className="flex items-center w-full mb-2" aria-expanded={genresOpen}>
            <span className="label">Genres</span>
            <span className="ml-auto transition-transform duration-200" style={{ color: "var(--muted)", transform: genresOpen ? "rotate(90deg)" : "rotate(0deg)" }}><Icon name="chevR" size={14} /></span>
          </button>
          {genresOpen && (
            <div className="flex flex-col gap-1.5">
              <button onClick={() => shuffleSource("all")} className="chip w-full text-left" style={activeSrc === "all" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>All</button>
              {genreItems.map((it) => (
                <button key={it.key} onClick={() => shuffleSource(it.key)} className="chip w-full text-left" style={activeSrc === it.key ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>{it.label}</button>
              ))}
            </div>
          )}
        </div>

        {/* Stations — the only scrolling region (collapsible, closed by default) */}
        <div className="flex-1 min-h-0 flex flex-col px-3 pt-3 pb-2" style={{ borderTop: "1px solid var(--border)" }}>
          <button onClick={() => setListOpen((o) => !o)} className="flex items-center w-full mb-2 shrink-0" aria-expanded={listOpen}>
            <span className="label">Stations</span>
            <span className="ml-auto transition-transform duration-200" style={{ color: "var(--muted)", transform: (listOpen || q) ? "rotate(90deg)" : "rotate(0deg)" }}><Icon name="chevR" size={14} /></span>
          </button>

          {/* search always visible — typing reveals matches even when collapsed */}
          <div className="relative mb-2 shrink-0">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stations…" className="w-full px-2.5 py-1.5 pr-7 text-xs" />
            {query && <button onClick={() => setQuery("")} title="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none" style={{ color: "var(--muted)" }}>✕</button>}
          </div>

          {(listOpen || q) && (
            <>
              <div className="flex gap-1.5 mb-2 shrink-0">
                <button onClick={() => chooseView("index")} className="chip flex-1" style={view === "index" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>Index</button>
                <button onClick={() => chooseView("favs")} className="chip flex-1" style={view === "favs" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>Favourites</button>
              </div>
              {listed.length === 0 ? (
                <div className="label px-1 py-1">{q ? "No matches." : view === "favs" ? "No favourites yet — tap ☆ on a station." : "No stations."}</div>
              ) : (
                <ul ref={listScrollRef} className="no-scrollbar space-y-0.5 overflow-y-auto overscroll-contain flex-1 -mx-1 px-1">{listed.map(renderRow)}</ul>
              )}
            </>
          )}
        </div>

        {/* settings — its own box at the bottom of the expanded panel */}
        <Link href="/settings" title="Settings" className="flex items-center gap-2 px-3 h-12 shrink-0 hover:bg-[var(--panel-2)]"
          style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
          <Icon name="gear" size={17} /><span className="text-sm">Settings</span>
        </Link>
      </div>

      {/* collapsed strip overlay: top opens the radio, a divided box at the bottom is Settings */}
      <div className="absolute inset-y-0 left-0 w-12 flex flex-col items-center transition-opacity duration-200"
        style={{ opacity: open ? 0 : 1, pointerEvents: open ? "none" : "auto" }}>
        <div onClick={() => setOpen(true)} title="Open radio" className="flex-1 w-full flex flex-col items-center cursor-pointer">
          <div className="h-14 grid place-items-center shrink-0">
            <button onClick={(e) => { e.stopPropagation(); setOpen(true); togglePlay(); }} title="Play radio" className="grid place-items-center hover:opacity-80" style={{ color: "var(--accent)" }}><Icon name={playing ? "pause" : "play"} size={26} /></button>
          </div>
          <div className="flex-1" />
          <span className="mb-3" style={{ color: "var(--muted)" }}><Icon name="chevR" size={16} /></span>
        </div>
        <Link href="/settings" title="Settings" className="w-full h-12 grid place-items-center shrink-0 hover:bg-[var(--panel-2)]"
          style={{ borderTop: "1px solid var(--border)", color: "var(--muted)" }}>
          <Icon name="gear" size={19} />
        </Link>
      </div>
    </aside>

    {/* ── Mobile (≤md): a slide-up radio sheet, toggled ONLY by the header radio
        button. No persistent on-screen player — closing the sheet leaves the audio
        playing (header button lights up) but nothing docked on the page. ── */}
    <div className="md:hidden">
      {/* backdrop — constrained to above the tab bar so the nav stays tappable */}
      <div onClick={() => setSheetOpen(false)} className="fixed inset-x-0 top-0 z-50 transition-opacity duration-300"
        style={{ bottom: "calc(56px + env(safe-area-inset-bottom))", background: "rgba(0,0,0,0.45)", opacity: sheetOpen ? 1 : 0, pointerEvents: sheetOpen ? "auto" : "none" }} />

      {/* bottom sheet — fixed height between the header (56px) and the tab bar, flush to the header */}
      <div className="fixed inset-x-0 z-[60] flex flex-col"
        style={{ top: "56px", bottom: "calc(56px + env(safe-area-inset-bottom))",
          background: "var(--bg)", borderLeft: "1px solid var(--border)", borderRight: "1px solid var(--border)",
          transform: sheetOpen ? "translateY(0)" : "translateY(102%)", transition: "transform 320ms cubic-bezier(0.4, 0, 0.2, 1)" }}>

        {/* big transport controls — play perfectly centred, shuffle pinned far right */}
        <div className="relative flex items-center justify-center px-4 py-5 shrink-0"
          style={{ background: "var(--header-bg)", borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-8">
            <button onClick={() => step(-1)} title="Previous" style={{ color: "var(--muted)" }}><Icon name="prev" size={28} /></button>
            <button onClick={togglePlay} title={playing ? "Pause" : "Play"}
              className="w-16 h-16 rounded-full grid place-items-center shrink-0"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
              <Icon name={playing ? "pause" : "play"} size={28} />
            </button>
            <button onClick={() => step(1)} title="Next" style={{ color: "var(--muted)" }}><Icon name="next" size={28} /></button>
          </div>
          <button onClick={toggleShuffle} title="Shuffle" className="absolute right-4"
            style={{ color: shuffleOn ? "var(--accent)" : "var(--muted)" }}><Icon name="shuffle" size={22} /></button>
        </div>

        {/* station info — below the controls */}
        <div className="px-4 py-3 shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-base font-medium leading-snug truncate" style={current ? { color: "var(--accent)" } : { color: "var(--muted)" }}>
                {current ? current.name : "Pick a genre or station"}
              </div>
              {current && (error
                ? <div className="label mt-1" style={{ color: "var(--down)" }}>stream unavailable</div>
                : <div className="mt-1 flex items-center gap-1.5 flex-wrap" style={{ fontSize: "0.75rem", color: "var(--accent-2)" }}>
                    <span>{sentence(current.genre)}</span>
                    {current.sourceUrl && (
                      <>
                        <span style={{ color: "var(--border)" }}>·</span>
                        <a href={current.sourceUrl} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 hover:underline">
                          {shortUrl(current.sourceUrl)} <Icon name="ext" size={11} />
                        </a>
                      </>
                    )}
                  </div>
              )}
            </div>
            {current && (
              <button onClick={() => toggleFav(current.name)} title="Favourite"
                className="text-xl shrink-0 leading-none"
                style={{ color: favs.includes(current.name) ? "var(--accent)" : "var(--muted)" }}>
                {favs.includes(current.name) ? "★" : "☆"}
              </button>
            )}
          </div>
        </div>

        {/* scrollable body: genres as chips, then the station list */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3">
          <div className="label mb-2">Genres</div>
          {/* one swipeable row (like the trending-news pills), not a stacked block */}
          <div className="flex flex-nowrap gap-1.5 mb-4 overflow-x-auto no-scrollbar -mx-3 px-3">
            <button onClick={() => shuffleSource("all")} className="chip shrink-0 whitespace-nowrap" style={activeSrc === "all" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>All</button>
            {genreItems.map((it) => (
              <button key={it.key} onClick={() => shuffleSource(it.key)} className="chip shrink-0 whitespace-nowrap" style={activeSrc === it.key ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>{it.label}</button>
            ))}
          </div>

          <div className="label mb-2">Stations</div>
          <div className="relative mb-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search stations…" className="w-full px-2.5 py-2 pr-7 text-sm" />
            {query && <button onClick={() => setQuery("")} title="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-sm leading-none" style={{ color: "var(--muted)" }}>✕</button>}
          </div>
          <div className="flex gap-1.5 mb-2">
            <button onClick={() => chooseView("index")} className="chip flex-1" style={view === "index" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>Index</button>
            <button onClick={() => chooseView("favs")} className="chip flex-1" style={view === "favs" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>Favourites</button>
          </div>
          {listed.length === 0 ? (
            <div className="label px-1 py-1">{q ? "No matches." : view === "favs" ? "No favourites yet — tap ☆ on a station." : "No stations."}</div>
          ) : (
            <ul className="space-y-0.5">
              {listed.map((s) => {
                const active = current?.name === s.name;
                return (
                  <li key={s.name}>
                    <div className="flex items-center gap-2 rounded-md px-2 py-2 text-sm cursor-pointer" onClick={() => play(s, base)}>
                      <span className="flex-1 truncate" style={active ? { color: "var(--accent)" } : {}}>{s.name}</span>
                      {s.sourceUrl && (
                        <a href={s.sourceUrl} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} title="Open station website" className="shrink-0" style={{ color: "var(--muted)" }}><Icon name="ext" size={14} /></a>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); toggleFav(s.name); }} className="shrink-0 text-base leading-none" style={{ color: favs.includes(s.name) ? "var(--accent)" : "var(--muted)" }}>{favs.includes(s.name) ? "★" : "☆"}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* no settings footer on mobile — settings lives in the header gear */}
      </div>
    </div>
    </>
  );
}

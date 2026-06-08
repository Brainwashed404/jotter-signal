import "server-only";
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { promisify } from "util";
import type { Signal, Expert, Overview } from "./types";

const gunzip = promisify(zlib.gunzip);

export type { Signal, Expert, Overview, ThemeSummary } from "./types";

// DATA_URL is used by scripts/fetch-data.js at BUILD TIME to download data files.
// At RUNTIME the app always reads from the local filesystem (data bundled into the
// serverless function via outputFileTracingIncludes). Network fetches are only used
// as a fallback if the local file is somehow missing.
const DATA_URL = process.env.DATA_URL?.replace(/\/$/, "");
// How long to keep data in-process before re-reading. Since data is baked into the
// build, 30 min is fine — the lambda will reuse it until the next cold start.
const CACHE_TTL = 30 * 60 * 1000;

const DATA_DIR = path.join(process.cwd(), "data");
const SIGNALS_PATH = path.join(DATA_DIR, "signals.jsonl");
const EXPERTS_PATH = path.join(DATA_DIR, "experts.json");
// User uploads (PDFs, in-app RSS feeds) live in a SEPARATE store so the engine
// rebuild (build_dataset.py, which overwrites the files above) never clobbers them.
export const UPLOADS_SIG_PATH = path.join(DATA_DIR, "uploads.jsonl");
export const UPLOADS_EXP_PATH = path.join(DATA_DIR, "uploads-experts.json");

// Cache across HMR reloads, keyed by combined file mtimes (dev) or TTL window (prod).
const g = globalThis as unknown as {
  __signals?: Signal[]; __signalsAt?: string;
  __experts?: Expert[]; __expertsAt?: string;
  __loadPromise?: Promise<void>;
};

function mtime(p: string): number {
  try { return fs.statSync(p).mtimeMs; } catch { return 0; }
}
function readJsonl(p: string): Signal[] {
  try { return fs.readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Signal); }
  catch { return []; }
}
function readJson<T>(p: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(p, "utf8")) as T; } catch { return fallback; }
}

// TTL bucket: rounds to 30-min windows so nightly builds appear without a redeploy.
function remoteCacheKey(): string {
  return String(Math.floor(Date.now() / CACHE_TTL));
}

export function clearCache() {
  delete g.__signals; delete g.__signalsAt;
  delete g.__experts; delete g.__expertsAt;
  delete g.__loadPromise;
}

/**
 * Pre-load signal data from R2 into the in-process cache.
 *
 * Production (DATA_URL set): fetches signals.jsonl + experts.json from R2 and
 * caches them for CACHE_TTL ms. Concurrent cold-start calls are deduplicated.
 *
 * Development (no DATA_URL): returns immediately; getSignals/getExperts read
 * from the local filesystem on demand, exactly as before.
 *
 * Add `await loadData()` at the top of any Server Component or API route handler
 * that calls getSignals / getExperts / searchSignals / etc.
 */
const SIGNALS_GZ_PATH = path.join(DATA_DIR, "signals.jsonl.gz");

/**
 * Pre-load signal data into the in-process cache.
 *
 * Priority order:
 *   1. Local signals.jsonl.gz — bundled at build time via scripts/fetch-data.js.
 *      This is the normal production path: zero network calls at runtime.
 *   2. Network fetch from DATA_URL — fallback if the bundled file is missing
 *      (shouldn't happen in normal builds, but handles edge cases gracefully).
 *   3. Empty state — if both fail, the app renders with empty sections rather
 *      than returning a 500.
 *
 * Development (no DATA_URL + no .gz file): returns immediately;
 * getSignals/getExperts read from the local filesystem on demand.
 */
export async function loadData(): Promise<void> {
  // Check if a bundled gz file exists (production: baked in at build time)
  const hasBundledGz = fs.existsSync(SIGNALS_GZ_PATH);

  if (!hasBundledGz && !DATA_URL) return; // dev: filesystem reads handle caching themselves

  const at = remoteCacheKey();
  if (g.__signals && g.__signalsAt === at) return; // still within TTL window

  // Deduplicate concurrent in-flight loads on cold start
  if (!g.__loadPromise) {
    g.__loadPromise = (async () => {
      try {
        let sigsText: string;
        let expsText: string;

        if (hasBundledGz) {
          // Fast path: read locally bundled files (no network I/O)
          const compressed = fs.readFileSync(SIGNALS_GZ_PATH);
          const decompressed = await gunzip(compressed);
          sigsText = decompressed.toString("utf8");
          expsText = fs.readFileSync(EXPERTS_PATH, "utf8");
        } else {
          // Fallback: fetch from remote storage (only if no bundled file)
          const [sigsRes, expsRes] = await Promise.all([
            fetch(`${DATA_URL}/signals.jsonl.gz`, { cache: "no-store" }),
            fetch(`${DATA_URL}/experts.json`, { cache: "no-store" }),
          ]);
          if (!sigsRes.ok) throw new Error(`signals.jsonl.gz fetch failed: ${sigsRes.status}`);
          if (!expsRes.ok) throw new Error(`experts.json fetch failed: ${expsRes.status}`);
          const sigsGz = await sigsRes.arrayBuffer().then((b) => gunzip(Buffer.from(b)));
          sigsText = sigsGz.toString("utf8");
          expsText = await expsRes.text();
        }

        g.__signals = sigsText.split("\n").filter(Boolean).map((l) => JSON.parse(l) as Signal);
        g.__experts = JSON.parse(expsText) as Expert[];
        g.__signalsAt = at;
        g.__expertsAt = at;
      } catch (err) {
        // All data sources failed. Fall back to empty state so the app renders
        // rather than throwing a 500.
        console.error("[data] loadData failed, serving empty state:", err);
        if (!g.__signals) { g.__signals = []; g.__signalsAt = at; }
        if (!g.__experts) { g.__experts = []; g.__expertsAt = at; }
      } finally {
        g.__loadPromise = undefined; // allow retry on next TTL window
      }
    })();
  }
  await g.__loadPromise;
}

export function getExperts(): Expert[] {
  if (DATA_URL) return g.__experts ?? []; // populated by loadData()
  const at = `${mtime(EXPERTS_PATH)}-${mtime(UPLOADS_EXP_PATH)}`;
  if (!g.__experts || g.__expertsAt !== at) {
    g.__experts = [...readJson<Expert[]>(EXPERTS_PATH, []), ...readJson<Expert[]>(UPLOADS_EXP_PATH, [])];
    g.__expertsAt = at;
  }
  return g.__experts!;
}

export function getExpert(id: string): Expert | undefined {
  return getExperts().find((e) => e.id === id);
}

export function getOverview(): Overview {
  const ex = getExperts();
  const years = Array.from(new Set(ex.flatMap((e) => e.years))).sort();
  return {
    experts: ex.map((e) => ({ id: e.id, name: e.name })),
    signals: ex.reduce((n, e) => n + e.totals.signals, 0),
    posts: ex.reduce((n, e) => n + e.totals.posts, 0),
    date_min: ex.reduce((m, e) => (e.totals.date_min < m ? e.totals.date_min : m), ex[0]?.totals.date_min ?? ""),
    date_max: ex.reduce((m, e) => (e.totals.date_max > m ? e.totals.date_max : m), ex[0]?.totals.date_max ?? ""),
    years,
    themeNames: (ex[0]?.themes ?? []).map((t) => t.theme).sort(),
  };
}

export function getSignals(): Signal[] {
  if (DATA_URL) return g.__signals ?? []; // populated by loadData()
  const at = `${mtime(SIGNALS_PATH)}-${mtime(UPLOADS_SIG_PATH)}`;
  if (!g.__signals || g.__signalsAt !== at) {
    g.__signals = [...readJsonl(SIGNALS_PATH), ...readJsonl(UPLOADS_SIG_PATH)];
    g.__signalsAt = at;
  }
  return g.__signals!;
}

const STOP = new Set(["the","a","an","of","and","or","to","in","on","for","is","are","what","how","his","does","about"]);

export type SortMode = "newest" | "oldest" | "relevance";

export function searchSignals(
  query: string,
  opts: { type?: string; kind?: string; theme?: string; years?: number[]; experts?: string[]; limit?: number; offset?: number; sort?: SortMode } = {}
): { results: Signal[]; total: number } {
  const limit = opts.limit ?? 40;
  const offset = opts.offset ?? 0;
  const sigs = getSignals();
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2 && !STOP.has(t));
  // Whole-word matchers so "divers" can't match "diversity"/"diverse".
  const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const termRes = terms.map((t) => new RegExp(`\\b${escapeRe(t)}\\b`, "g"));
  const sort: SortMode = opts.sort ?? (terms.length ? "relevance" : "newest");
  const byDate = (a: Signal, b: Signal) =>
    sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);

  let pool = sigs;
  if (opts.type) pool = pool.filter((s) => s.type === opts.type);
  if (opts.kind) pool = pool.filter((s) => s.kind === opts.kind);
  if (opts.theme) pool = pool.filter((s) => s.themes.includes(opts.theme!));
  if (opts.years && opts.years.length) {
    const ys = new Set(opts.years);
    pool = pool.filter((s) => ys.has(s.year));
  }
  if (opts.experts && opts.experts.length) {
    const es = new Set(opts.experts);
    pool = pool.filter((s) => es.has(s.source_id));
  }

  // browse (no query): order the whole pool by date
  if (terms.length === 0) {
    const sorted = [...pool].sort(byDate);
    return { results: sorted.slice(offset, offset + limit), total: pool.length };
  }

  // query present: keep only matches, then order by relevance or date
  const scored: { s: Signal; score: number }[] = [];
  for (const s of pool) {
    const head = s.heading.toLowerCase();
    const body = s.text.toLowerCase();
    let score = 0;
    for (const re of termRes) {
      re.lastIndex = 0;
      if (re.test(head)) score += 5;
      re.lastIndex = 0;
      const m = body.match(re);
      if (m) score += m.length;
    }
    if (score > 0) {
      const yrBoost = (s.year - 2002) * 0.15;
      scored.push({ s, score: score + yrBoost });
    }
  }
  const ordered =
    sort === "relevance"
      ? scored.sort((a, b) => b.score - a.score || b.s.date.localeCompare(a.s.date)).map((x) => x.s)
      : scored.map((x) => x.s).sort(byDate);
  return { results: ordered.slice(offset, offset + limit), total: ordered.length };
}

export function recentSignals(type: string, limit = 12): Signal[] {
  return getSignals()
    .filter((s) => s.type === type)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

export type WeeklySummary = {
  from: string;
  to: string;
  days: number;
  count: number;
  themes: { theme: string; n: number }[];
  longreads: { heading: string; date: string; post_url: string }[];
  books: { heading: string; date: string; post_url: string }[];
  quotes: { text: string; date: string; post_url: string }[];
  domains: { domain: string; n: number; url: string }[];
};

// Automated rolling summary of the most recent `days` of signals.
export function weeklySummary(days = 7): WeeklySummary {
  const sigs = getSignals();
  const to = sigs.reduce((m, s) => (s.date > m ? s.date : m), "").slice(0, 10);
  const d = new Date(to + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  const from = d.toISOString().slice(0, 10);

  const inWin = sigs.filter((s) => {
    const day = s.date.slice(0, 10);
    return day >= from && day <= to;
  });

  const tc = new Map<string, number>();
  for (const s of inWin) for (const t of s.themes) tc.set(t, (tc.get(t) ?? 0) + 1);
  const themes = [...tc.entries()].map(([theme, n]) => ({ theme, n })).sort((a, b) => b.n - a.n);

  const dc = new Map<string, { n: number; url: string }>();
  for (const s of inWin)
    for (const l of s.links) {
      const cur = dc.get(l.domain);
      if (cur) cur.n += 1;
      else dc.set(l.domain, { n: 1, url: l.url });
    }
  const domains = [...dc.entries()]
    .filter(([dm]) => !["youtube.com", "youtu.be", "amzn.to", "en.wikipedia.org"].includes(dm))
    .map(([domain, v]) => ({ domain, n: v.n, url: v.url }))
    .sort((a, b) => b.n - a.n);

  const pick = (type: string) =>
    inWin.filter((s) => s.type === type).sort((a, b) => b.date.localeCompare(a.date));

  const longreads = pick("longread").map((s) => ({ heading: s.heading, date: s.date.slice(0, 10), post_url: s.post_url }));
  const books = pick("book").map((s) => ({ heading: s.heading, date: s.date.slice(0, 10), post_url: s.post_url }));
  const quotes = pick("quote").map((s) => ({ text: s.text, date: s.date.slice(0, 10), post_url: s.post_url }));

  return { from, to, days, count: inWin.length, themes, longreads, books, quotes, domains };
}

export type Briefing = {
  from: string;
  to: string;
  days: number;
  count: number;
  expertCount: number;
  themes: { theme: string; n: number; experts: number; delta: number }[];
  stats: { text: string; source: string; sourceId: string; heading: string; post_url: string; date: string }[];
};

// Insightful weekly briefing: theme momentum vs the prior 4 weeks, cross-expert
// convergence, and notable stats/claims extracted from the actual article text.
export function weeklyBriefing(days = 7): Briefing {
  const sigs = getSignals();
  const to = sigs.reduce((m, s) => (s.date > m ? s.date : m), "").slice(0, 10);
  const mk = (back: number) => {
    const d = new Date(to + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - back);
    return d.toISOString().slice(0, 10);
  };
  const from = mk(days);
  const priorFrom = mk(days * 5); // 4-week baseline immediately before this week
  const day = (s: Signal) => s.date.slice(0, 10);
  const inWin = sigs.filter((s) => day(s) >= from && day(s) <= to);
  const prior = sigs.filter((s) => day(s) >= priorFrom && day(s) < from);
  const weekTotal = inWin.length || 1;
  const priorTotal = prior.length || 1;

  // theme momentum + convergence
  const tc = new Map<string, { n: number; experts: Set<string> }>();
  for (const s of inWin)
    for (const t of s.themes) {
      const e = tc.get(t) || { n: 0, experts: new Set<string>() };
      e.n += 1; e.experts.add(s.source_id); tc.set(t, e);
    }
  const pc = new Map<string, number>();
  for (const s of prior) for (const t of s.themes) pc.set(t, (pc.get(t) ?? 0) + 1);
  const themes = [...tc.entries()]
    .map(([theme, e]) => ({
      theme,
      n: e.n,
      experts: e.experts.size,
      delta: Math.round((100 * e.n / weekTotal - 100 * (pc.get(theme) ?? 0) / priorTotal) * 10) / 10,
    }))
    .sort((a, b) => b.n - a.n);

  // notable stats / claims pulled from article bodies
  // require a number adjacent to a unit (%, $, magnitude) for clean, real stats
  const STAT = /(\d[\d,.]*\s?(?:%|percent)|\$\s?\d[\d,.]*|\b\d[\d,.]*\s?(?:bn|billion|million|trillion)\b)/i;
  const JUNK = /(https?:|\d{1,2}:\d{2}|\d+\s?[x×]\b|@|\|)/i; // urls, timecodes, playback, handles
  const stats: Briefing["stats"] = [];
  const seen = new Set<string>();
  const pool = inWin
    .filter((s) => ["article", "longread", "commonplace", "note", "chart"].includes(s.type))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const s of pool) {
    const sentences = s.text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/);
    for (const raw of sentences) {
      const t = raw.trim();
      if (t.length < 55 || t.length > 230) continue;
      if (JUNK.test(t) || !STAT.test(t)) continue;
      if ((t.match(/[A-Za-z]/g) || []).length < t.length * 0.6) continue; // mostly prose
      const key = t.slice(0, 60).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      stats.push({ text: t, source: s.source, sourceId: s.source_id, heading: s.heading, post_url: s.post_url, date: s.date.slice(0, 10) });
      break; // at most one per signal
    }
    if (stats.length >= 60) break; // large pool; home page shuffles + samples
  }

  return {
    from, to, days,
    count: inWin.length,
    expertCount: new Set(inWin.map((s) => s.source_id)).size,
    themes, stats,
  };
}

// One most-recent signal per expert, ordered by recency — for the home page grid.
// Only includes experts whose latest signal is within the last `days` (default 28).
export function getLatestPerExpert(days = 28): Signal[] {
  const sigs = getSignals();
  const maxDate = sigs.reduce((m, s) => (s.date > m ? s.date : m), "").slice(0, 10);
  const d = new Date(maxDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  const cutoff = d.toISOString().slice(0, 10);

  const latest = new Map<string, Signal>();
  for (const s of sigs) {
    const cur = latest.get(s.source_id);
    if (!cur || s.date > cur.date) latest.set(s.source_id, s);
  }
  return Array.from(latest.values())
    .filter((s) => s.date.slice(0, 10) >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));
}

// Suggested Ask prompts, built from the themes actually active in the archive.
// Returns a shuffled pool the client samples a few from (and can reshuffle).
export function suggestedPrompts(limit = 20): string[] {
  const b = weeklyBriefing(7);
  const active = b.themes.filter((t) => t.n >= 2).sort((x, y) => y.n - x.n).map((t) => t.theme);
  const all = getOverview().themeNames;
  const themes = (active.length >= 4 ? active : all).slice(0, 8);

  const framings = [
    (t: string) => `What do my experts think about ${t}?`,
    (t: string) => `Where do my experts disagree on ${t}?`,
    (t: string) => `What's the strongest case being made about ${t}?`,
    (t: string) => `What's changed recently in thinking on ${t}?`,
    (t: string) => `Who's most worth reading on ${t}?`,
  ];

  const pool: string[] = [];
  for (const t of themes) for (const f of framings) pool.push(f(t));
  pool.push("Where do my experts most disagree right now?");
  pool.push("What's the most contrarian take in the archive this month?");
  pool.push("What are my experts getting wrong, in hindsight?");

  // Fisher–Yates shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}

// Short search-term suggestions for the Search bar — themes from the archive plus
// specific, researcher-friendly phrases. Shuffled so the bar always offers something new.
export function suggestedSearches(limit = 24): string[] {
  const themes = getOverview().themeNames;
  const specifics = [
    "AI bubble", "enshittification", "surveillance capitalism", "AI agents",
    "chip export controls", "data centres", "open-source AI", "attention economy",
    "content moderation", "platform decay", "synthetic media", "AI and jobs",
    "digital sovereignty", "creator economy", "AI safety", "misinformation",
    "techno-optimism", "AI regulation", "social media", "automation",
    "deepfakes", "antitrust", "AI hype", "degrowth",
  ];
  const pool = [...themes, ...specifics];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, limit);
}

// How themes evolve across ALL sources: for each year, the % of that year's signals
// touching each theme. Returns the top-N themes by overall prevalence.
export function themeTrends(opts: { topN?: number; span?: number } = {}): {
  years: number[];
  series: { theme: string; values: number[]; current: number }[];
} {
  const topN = opts.topN ?? 6;
  const span = opts.span ?? 12;
  const sigs = getSignals();
  const maxYear = sigs.reduce((m, s) => Math.max(m, s.year), 0);
  const minYear = maxYear - span + 1;
  const years: number[] = [];
  for (let y = minYear; y <= maxYear; y++) years.push(y);

  const totalByYear = new Map<number, number>();
  const themeYear = new Map<string, Map<number, number>>();
  for (const s of sigs) {
    if (s.year < minYear || s.year > maxYear) continue;
    totalByYear.set(s.year, (totalByYear.get(s.year) ?? 0) + 1);
    for (const t of s.themes) {
      let m = themeYear.get(t);
      if (!m) { m = new Map(); themeYear.set(t, m); }
      m.set(s.year, (m.get(s.year) ?? 0) + 1);
    }
  }
  const top = [...themeYear.entries()]
    .map(([theme, m]) => ({ theme, total: [...m.values()].reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, topN)
    .map((x) => x.theme);

  const series = top.map((theme) => {
    const m = themeYear.get(theme)!;
    const values = years.map((y) => {
      const tot = totalByYear.get(y) ?? 0;
      return tot ? Math.round((1000 * (m.get(y) ?? 0)) / tot) / 10 : 0;
    });
    return { theme, values, current: values[values.length - 1] ?? 0 };
  });
  return { years, series };
}

// ---------- Topic trends: arbitrary-term prevalence over a chosen window ----------
// Powers the Insights "Trending topics" research tool: type any term(s), pick a year
// range, and see mentions over time, momentum, the experts driving it, and exemplar
// signals. With no terms it falls back to the most prevalent themes in the window.
export type TopicSeries = {
  term: string;
  isTheme: boolean;
  counts: number[];           // matching signals per bucket
  total: number;              // matching signals across the window
  share: number;              // % of all windowed signals that mention the term
  momentum: number;           // % change: recent half vs earlier half (volume)
  topExperts: { id: string; name: string; n: number }[];
  latest: { heading: string; source: string; sourceId: string; date: string; url: string }[];
};
export type TopicTrends = {
  granularity: "month" | "year";
  buckets: string[];          // axis labels: "2025-06" (month) or "2024" (year)
  totalByBucket: number[];
  series: TopicSeries[];
  isThemeDefault: boolean;
  range: { from: string; to: string };
};

function monthsBetween(from: string, to: string): string[] {
  // inclusive list of YYYY-MM from `from` (YYYY-MM) to `to` (YYYY-MM)
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

export function topicTrends(opts: { terms?: string[]; months?: number | null; topN?: number } = {}): TopicTrends {
  const topN = opts.topN ?? 6;
  const sigs = getSignals();
  // window: anchored to the most recent signal date
  const maxDate = sigs.reduce((m, s) => (s.date > m ? s.date : m), "0000-00-00").slice(0, 10);
  const to = maxDate < "1000" ? new Date().toISOString().slice(0, 10) : maxDate;
  let from: string;
  if (opts.months && opts.months > 0) {
    const d = new Date(to + "T00:00:00Z");
    d.setUTCMonth(d.getUTCMonth() - (opts.months - 1));
    d.setUTCDate(1);
    from = d.toISOString().slice(0, 10);
  } else {
    from = sigs.reduce((m, s) => (s.date && s.date < m ? s.date : m), to).slice(0, 10);
  }

  const pool = sigs.filter((s) => s.date.slice(0, 10) >= from && s.date.slice(0, 10) <= to);
  const fromMonth = from.slice(0, 7), toMonth = to.slice(0, 7);
  const months = monthsBetween(fromMonth, toMonth);
  const granularity: "month" | "year" = months.length <= 36 ? "month" : "year";
  const buckets = granularity === "month"
    ? months
    : Array.from(new Set(months.map((m) => m.slice(0, 4))));
  const bucketOf = (date: string) => (granularity === "month" ? date.slice(0, 7) : date.slice(0, 4));
  const bucketIndex = new Map(buckets.map((b, i) => [b, i]));

  const totalByBucket = new Array(buckets.length).fill(0);
  for (const s of pool) {
    const i = bucketIndex.get(bucketOf(s.date));
    if (i !== undefined) totalByBucket[i]++;
  }

  // pick what to chart
  const terms = (opts.terms ?? []).map((t) => t.trim()).filter(Boolean);
  const isThemeDefault = terms.length === 0;
  let labels: { term: string; isTheme: boolean; match: (s: Signal) => boolean }[];
  if (isThemeDefault) {
    const tally = new Map<string, number>();
    for (const s of pool) for (const t of s.themes) tally.set(t, (tally.get(t) ?? 0) + 1);
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, topN).map(([t]) => t);
    labels = top.map((t) => ({ term: t, isTheme: true, match: (s: Signal) => s.themes.includes(t) }));
  } else {
    // Recognise theme names (e.g. "Crypto / web3") and match those by theme
    // membership; everything else is whole-word free-text search of heading+body.
    const themeVocab = new Map<string, string>(); // lowercased → canonical
    for (const s of sigs) for (const t of s.themes) if (!themeVocab.has(t.toLowerCase())) themeVocab.set(t.toLowerCase(), t);
    const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    labels = terms.slice(0, 6).map((term) => {
      const canon = themeVocab.get(term.toLowerCase());
      if (canon) return { term: canon, isTheme: true, match: (s: Signal) => s.themes.includes(canon) };
      const re = new RegExp(`\\b${escapeRe(term).replace(/\s+/g, "\\s+")}\\b`, "i");
      return { term, isTheme: false, match: (s: Signal) => re.test(s.heading) || re.test(s.text) };
    });
  }

  const series: TopicSeries[] = labels.map(({ term, isTheme, match }) => {
    const counts = new Array(buckets.length).fill(0);
    const matches: Signal[] = [];
    const byExpert = new Map<string, { name: string; n: number }>();
    for (const s of pool) {
      if (!match(s)) continue;
      matches.push(s);
      const i = bucketIndex.get(bucketOf(s.date));
      if (i !== undefined) counts[i]++;
      const e = byExpert.get(s.source_id) ?? { name: s.source, n: 0 };
      e.n++; byExpert.set(s.source_id, e);
    }
    const total = matches.length;
    const windowTotal = pool.length || 1;
    const share = Math.round((1000 * total) / windowTotal) / 10;
    // momentum: mean per-bucket volume, recent half vs earlier half
    const half = Math.floor(counts.length / 2) || 1;
    const earlier = counts.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const recent = counts.slice(counts.length - half).reduce((a, b) => a + b, 0) / half;
    const momentum = earlier > 0 ? Math.round((100 * (recent - earlier)) / earlier) : recent > 0 ? 100 : 0;
    const topExperts = [...byExpert.entries()]
      .map(([id, v]) => ({ id, name: v.name, n: v.n }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 3);
    const latest = matches
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 3)
      .map((s) => ({ heading: s.heading, source: s.source, sourceId: s.source_id, date: s.date, url: s.post_url }));
    return { term, isTheme, counts, total, share, momentum, topExperts, latest };
  });

  return { granularity, buckets, totalByBucket, series, isThemeDefault, range: { from, to } };
}

// ---------- Theme momentum heatmap: themes × months share-of-coverage ----------
// Powers the Insights "What's heating up" grid: every theme's monthly share of all
// signals over the window, plus a recent-vs-earlier momentum read. Built from the
// whole corpus so it reflects every source feeding the dashboard.
export type ThemeHeatmap = {
  months: string[];        // YYYY-MM
  monthLabels: string[];   // "Jun 25"
  rows: { theme: string; counts: number[]; pct: number[]; total: number; momentum: number; current: number }[];
  maxPct: number;
};
export function themeHeatmap(months = 12): ThemeHeatmap {
  const sigs = getSignals();
  const maxMonth = sigs.reduce((m, s) => (s.date.slice(0, 7) > m ? s.date.slice(0, 7) : m), "0000-00");
  let [y, mo] = maxMonth.split("-").map(Number);
  mo -= months - 1;
  while (mo <= 0) { mo += 12; y -= 1; }
  const buckets = monthsBetween(`${y}-${String(mo).padStart(2, "0")}`, maxMonth);
  const idx = new Map(buckets.map((b, i) => [b, i]));
  const totalByM = new Array(buckets.length).fill(0);
  const themeM = new Map<string, number[]>();
  for (const s of sigs) {
    const i = idx.get(s.date.slice(0, 7));
    if (i === undefined) continue;
    totalByM[i]++;
    for (const t of s.themes) {
      let arr = themeM.get(t);
      if (!arr) { arr = new Array(buckets.length).fill(0); themeM.set(t, arr); }
      arr[i]++;
    }
  }
  const rows = [...themeM.entries()].map(([theme, counts]) => {
    const total = counts.reduce((a, b) => a + b, 0);
    const pct = counts.map((c, i) => (totalByM[i] ? Math.round((1000 * c) / totalByM[i]) / 10 : 0));
    // momentum from SHARE (not raw counts) so a growing corpus doesn't make everything "rise" —
    // this is the change in this theme's share of attention, recent half vs earlier half.
    const half = Math.max(1, Math.floor(pct.length / 2));
    const earlier = pct.slice(0, half).reduce((a, b) => a + b, 0) / half;
    const recent = pct.slice(pct.length - half).reduce((a, b) => a + b, 0) / half;
    const momentum = earlier > 0 ? Math.round((100 * (recent - earlier)) / earlier) : recent > 0 ? 100 : 0;
    return { theme, counts, pct, total, momentum, current: pct[pct.length - 1] ?? 0 };
  }).sort((a, b) => b.total - a.total);
  const maxPct = Math.max(1, ...rows.flatMap((r) => r.pct));
  const monthLabels = buckets.map((b) => {
    const [yy, mm] = b.split("-").map(Number);
    return new Date(Date.UTC(yy, mm - 1, 1)).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
  });
  return { months: buckets, monthLabels, rows, maxPct };
}

// Reading feed: most recent meaningful signals, optionally filtered by type.
export function latestFeed(opts: { type?: string; limit?: number } = {}): Signal[] {
  const limit = opts.limit ?? 40;
  let pool = getSignals();
  if (opts.type) pool = pool.filter((s) => s.type === opts.type);
  return [...pool].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

const demd = (t: string) => t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

// Recent substantive signals (essays/articles, not link-dumps) for synthesis.
export function recentForSynthesis(days = 10, limit = 40): Signal[] {
  const sigs = getSignals();
  const to = sigs.reduce((m, s) => (s.date > m ? s.date : m), "").slice(0, 10);
  const d = new Date(to + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  const from = d.toISOString().slice(0, 10);
  const day = (s: Signal) => s.date.slice(0, 10);

  const pool = sigs.filter(
    (s) =>
      day(s) >= from && day(s) <= to &&
      (s.kind === "longread" || s.kind === "article" || s.kind === "data") &&
      demd(s.text).length > 280
  );
  // diversify: round-robin across experts so one prolific source can't dominate
  const byExpert = new Map<string, Signal[]>();
  for (const s of pool.sort((a, b) => b.date.localeCompare(a.date))) {
    const arr = byExpert.get(s.source_id) ?? [];
    arr.push(s);
    byExpert.set(s.source_id, arr);
  }
  const out: Signal[] = [];
  let added = true;
  for (let round = 0; added && out.length < limit; round++) {
    added = false;
    for (const arr of byExpert.values()) {
      if (arr[round]) { out.push(arr[round]); added = true; if (out.length >= limit) break; }
    }
  }
  return out;
}

export type Thread = {
  term: string;
  experts: string[];
  signals: { heading: string; source: string; sourceId: string; post_url: string; date: string }[];
};

// Specific subjects that several *independent* experts raised in the recent window.
// Surfaces named entities (people, companies, places, products) — the connective
// tissue across the week — rather than generic theme buckets.
export function weeklyThreads(days = 10, maxThreads = 7): Thread[] {
  const pool = recentForSynthesis(days, 120);

  // proper-noun phrases: runs of Capitalised words (e.g. "Sam Altman", "Ukraine", "OpenAI")
  const ENTITY = /\b([A-Z][a-zA-Z0-9.&'’+-]*(?:\s+(?:of|the|for|&)?\s*[A-Z][a-zA-Z0-9.&'’+-]*){0,3})\b/g;
  const STOPENT = new Set([
    "The","This","That","These","Those","There","Their","They","Then","Today","Tuesday","Monday",
    "Wednesday","Thursday","Friday","Saturday","Sunday","I","We","You","He","She","It","A","An",
    "But","And","Or","So","If","As","At","In","On","Of","To","For","With","From","By","One","Two",
    "First","Last","New","Now","Why","What","When","How","Who","Where","Yes","No","Mr","Ms","Dr",
    "AI","US","UK","EU","CEO","CapEx","GDP","Source","Image","Note","Read","Subscribe",
    // sentence-initial / connective words that get capitalised mid-prose
    "Because","However","While","Although","Meanwhile","Despite","After","Before","Since","Both",
    "Many","Most","Some","Even","Still","Here","More","Other","Each","Every","Another","Indeed",
    "Perhaps","Maybe","Yet","Thus","Also","According","Instead","Unlike","Plus","Given","About",
    "During","Until","Unless","Whether","Rather","Once","Already","Often","Always","Never","Soon",
    "Recently","Eventually","Finally","Currently","Like","Just","Only","Such","Much","Less","Several",
  ]);
  const norm = (s: string) => s.trim().replace(/[’']s$/i, "").replace(/\s+/g, " ");

  const map = new Map<string, { experts: Set<string>; sigs: Signal[]; seen: Set<string> }>();
  for (const s of pool) {
    const hay = `${s.heading}. ${demd(s.text).slice(0, 1200)}`;
    const found = new Set<string>();
    let m: RegExpExecArray | null;
    ENTITY.lastIndex = 0;
    while ((m = ENTITY.exec(hay))) {
      const phrase = norm(m[1]);
      const words = phrase.split(" ");
      const head = words[0];
      if (phrase.length < 4 || STOPENT.has(head)) continue;
      if (words.length === 1 && phrase.length < 5) continue; // skip tiny single tokens
      found.add(phrase);
    }
    for (const term of found) {
      const e = map.get(term) ?? { experts: new Set<string>(), sigs: [], seen: new Set<string>() };
      e.experts.add(s.source_id);
      if (!e.seen.has(s.id)) { e.seen.add(s.id); e.sigs.push(s); }
      map.set(term, e);
    }
  }

  // Merge case/substring near-duplicates handled implicitly; rank by #experts then #signals.
  const threads = [...map.entries()]
    .filter(([, e]) => e.experts.size >= 2)
    .map(([term, e]) => ({
      term,
      experts: [...e.experts],
      sigs: e.sigs.sort((a, b) => b.date.localeCompare(a.date)),
      score: e.experts.size * 10 + e.sigs.length,
    }))
    .sort((a, b) => b.score - a.score);

  // de-overlap: drop a thread if a higher-ranked one already shares a word stem
  const picked: typeof threads = [];
  const usedWords = new Set<string>();
  for (const t of threads) {
    const words = t.term.toLowerCase().split(" ").filter((w) => w.length > 3);
    if (words.some((w) => usedWords.has(w))) continue;
    words.forEach((w) => usedWords.add(w));
    picked.push(t);
    if (picked.length >= maxThreads) break;
  }

  return picked.map((t) => {
    // show one representative (most recent) signal per distinct expert, up to 4,
    // so the displayed sources match the expert count
    const perExpert = new Map<string, Signal>();
    for (const s of t.sigs) if (!perExpert.has(s.source_id)) perExpert.set(s.source_id, s);
    const display = [...perExpert.values()].slice(0, 4);
    return {
      term: t.term,
      experts: t.experts,
      signals: display.map((s) => ({
        heading: s.heading,
        source: s.source,
        sourceId: s.source_id,
        post_url: s.post_url,
        date: s.date.slice(0, 10),
      })),
    };
  });
}

import "server-only";
import fs from "fs";
import path from "path";
import type { Signal, Expert, Overview } from "./types";

export type { Signal, Expert, Overview, ThemeSummary } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

// cache across HMR reloads in dev
const g = globalThis as unknown as { __signals?: Signal[]; __experts?: Expert[] };

export function clearCache() {
  delete g.__signals;
  delete g.__experts;
}

export function getExperts(): Expert[] {
  if (!g.__experts) {
    g.__experts = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "experts.json"), "utf8"));
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
  if (!g.__signals) {
    const raw = fs.readFileSync(path.join(DATA_DIR, "signals.jsonl"), "utf8");
    g.__signals = raw
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Signal);
  }
  return g.__signals!;
}

const STOP = new Set(["the","a","an","of","and","or","to","in","on","for","is","are","what","how","his","does","about"]);

export type SortMode = "newest" | "oldest" | "relevance";

export function searchSignals(
  query: string,
  opts: { type?: string; theme?: string; years?: number[]; experts?: string[]; limit?: number; offset?: number; sort?: SortMode } = {}
): { results: Signal[]; total: number } {
  const limit = opts.limit ?? 40;
  const offset = opts.offset ?? 0;
  const sigs = getSignals();
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2 && !STOP.has(t));
  const sort: SortMode = opts.sort ?? (terms.length ? "relevance" : "newest");
  const byDate = (a: Signal, b: Signal) =>
    sort === "oldest" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);

  let pool = sigs;
  if (opts.type) pool = pool.filter((s) => s.type === opts.type);
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
    for (const t of terms) {
      if (head.includes(t)) score += 5;
      const m = body.split(t).length - 1;
      score += m;
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
    if (stats.length >= 12) break;
  }

  return {
    from, to, days,
    count: inWin.length,
    expertCount: new Set(inWin.map((s) => s.source_id)).size,
    themes, stats,
  };
}

// Reading feed: most recent meaningful signals, optionally filtered by type.
export function latestFeed(opts: { type?: string; limit?: number } = {}): Signal[] {
  const limit = opts.limit ?? 40;
  let pool = getSignals();
  if (opts.type) pool = pool.filter((s) => s.type === opts.type);
  return [...pool].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

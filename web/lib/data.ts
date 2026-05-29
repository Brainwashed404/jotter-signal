import "server-only";
import fs from "fs";
import path from "path";
import type { Signal, Radar } from "./types";

export type { Signal, Radar, ThemeSummary } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

// cache across HMR reloads in dev
const g = globalThis as unknown as { __signals?: Signal[]; __radar?: Radar };

export function getRadar(): Radar {
  if (!g.__radar) {
    g.__radar = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "radar.json"), "utf8"));
  }
  return g.__radar!;
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
  opts: { type?: string; theme?: string; years?: number[]; limit?: number; offset?: number; sort?: SortMode } = {}
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

// Reading feed: most recent meaningful signals, optionally filtered by type.
export function latestFeed(opts: { type?: string; limit?: number } = {}): Signal[] {
  const limit = opts.limit ?? 40;
  let pool = getSignals();
  if (opts.type) pool = pool.filter((s) => s.type === opts.type);
  return [...pool].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

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

export function searchSignals(
  query: string,
  opts: { type?: string; theme?: string; limit?: number } = {}
): { results: Signal[]; total: number } {
  const sigs = getSignals();
  const terms = query.toLowerCase().split(/\W+/).filter((t) => t.length > 2 && !STOP.has(t));
  let pool = sigs;
  if (opts.type) pool = pool.filter((s) => s.type === opts.type);
  if (opts.theme) pool = pool.filter((s) => s.themes.includes(opts.theme!));

  if (terms.length === 0) {
    const sorted = [...pool].sort((a, b) => b.date.localeCompare(a.date));
    return { results: sorted.slice(0, opts.limit ?? 40), total: pool.length };
  }

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
      // gentle recency boost so live signals surface
      const yrBoost = (s.year - 2002) * 0.15;
      scored.push({ s, score: score + yrBoost });
    }
  }
  scored.sort((a, b) => b.score - a.score || b.s.date.localeCompare(a.s.date));
  return {
    results: scored.slice(0, opts.limit ?? 40).map((x) => x.s),
    total: scored.length,
  };
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

import "server-only";
import fs from "fs";
import path from "path";

export type Signal = {
  id: string;
  post_id: number;
  date: string;
  year: number;
  source: string;
  source_id: string;
  type: string;
  heading: string;
  text: string;
  themes: string[];
  links: { url: string; domain: string; anchor: string }[];
  post_url: string;
};

export type ThemeSummary = {
  theme: string;
  current: number;
  delta: number;
  series: Record<string, number>;
};

export type Radar = {
  totals: { posts: number; signals: number; date_min: string; date_max: string };
  signal_types: Record<string, number>;
  themes: ThemeSummary[];
  years: string[];
  top_sources_recent: { domain: string; n: number }[];
  top_sources_early: { domain: string; n: number }[];
};

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

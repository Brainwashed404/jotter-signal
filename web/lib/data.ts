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

// Rolling feed for the home page: every expert/publication's posts from the last
// `days`, newest first. A light per-source cap keeps a high-volume source (e.g.
// Futurism) from flooding it, so the feed stays varied across sources.
export function getRecentFeed(days = 7, perSource = 3): Signal[] {
  const sigs = getSignals();
  const maxDate = sigs.reduce((m, s) => (s.date > m ? s.date : m), "").slice(0, 10);
  const d = new Date(maxDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - days);
  const cutoff = d.toISOString().slice(0, 10);
  const recent = sigs
    .filter((s) => s.date.slice(0, 10) >= cutoff)
    .sort((a, b) => b.date.localeCompare(a.date));
  const perSrc = new Map<string, number>();
  const out: Signal[] = [];
  for (const s of recent) {
    const n = perSrc.get(s.source_id) ?? 0;
    if (n >= perSource) continue;
    perSrc.set(s.source_id, n + 1);
    out.push(s);
  }
  return out;
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

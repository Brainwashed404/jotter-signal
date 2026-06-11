// "What Did I Miss?" (WDIM) — LOCAL PROTOTYPE, server-only.
//
// Synthesises trending business news, market data and curated expert signals
// into a fixed executive briefing: three sections (Economy, Consumers, Technology),
// each a 3-5 sentence analytical summary plus three real source documents.
// UK English, no em dashes, no advice.
//
// Generator order:
//   1. the `claude` CLI (Claude Code) — uses your existing subscription, no API key
//   2. an ANTHROPIC_API_KEY, if set in .env.local
//
// Returns null if no LLM is available. The route maps null → { available: false }
// so the home module disappears cleanly rather than showing placeholder copy.
//
// Gated OFF in production (see app/api/wdim/route.ts).
import "server-only";
import { spawn } from "node:child_process";
import { recentForSynthesis, getSignals } from "./data";
import type { Signal } from "./types";

export type WdimRange = "day" | "week" | "month";
export type WdimPiece = { title: string; source: string; focus: string; url?: string };
export type WdimSection = { data: string; insight: string; pieces: WdimPiece[] };
export type WdimSections = { economy: WdimSection; consumers: WdimSection; technology: WdimSection };
export type WdimNews = { title: string; source: string; category?: string; url?: string };
export type WdimMarket = { name: string; price: number; changePct: number };

export type WdimResult = {
  range: WdimRange;
  mode: "claude-cli" | "api";
  sections: WdimSections;
  generatedAt: string;
};

const RANGE_DAYS: Record<WdimRange, number> = { day: 1, week: 7, month: 30 };
const RANGE_LABEL: Record<WdimRange, string> = {
  day: "past day", week: "past week", month: "past month",
};
const RANGE_DENSITY: Record<WdimRange, string> = {
  day: "Synthesise the dominant global corporate narratives of the past 24 hours.",
  week: "Aggregate structural shifts and macro trajectories from the past seven days.",
  month: "Identify the longer-term structural shifts and macro trajectories that defined the past month.",
};

function snippet(s: Signal, n = 220): string {
  const t = (s.text || "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? t.slice(0, n).trimEnd() + "…" : t;
}

function gather(range: WdimRange): Signal[] {
  const days = RANGE_DAYS[range];
  const limit = range === "month" ? 40 : range === "week" ? 30 : 20;
  return recentForSynthesis(days, limit);
}

// Build a normalised title → article URL lookup from both signals and news items.
// Used post-generation to attach real URLs to the pieces the model selects.
function buildUrlMap(items: Signal[], news: WdimNews[]): Map<string, string> {
  const map = new Map<string, string>();
  const norm = (s: string) =>
    s.toLowerCase().trim().replace(/[""'']/g, '"').replace(/\s+/g, " ");
  for (const s of items) {
    if (s.post_url && s.heading) map.set(norm(s.heading), s.post_url);
  }
  for (const n of news) {
    if (n.url && n.title) map.set(norm(n.title), n.url);
  }
  return map;
}

function attachUrls(sections: WdimSections, urlMap: Map<string, string>): WdimSections {
  const norm = (s: string) =>
    s.toLowerCase().trim().replace(/[""'']/g, '"').replace(/\s+/g, " ");
  const fix = (sec: WdimSection): WdimSection => ({
    ...sec,
    pieces: sec.pieces.map((p) => ({ ...p, url: urlMap.get(norm(p.title)) })),
  });
  return { economy: fix(sections.economy), consumers: fix(sections.consumers), technology: fix(sections.technology) };
}

function buildPrompt(range: WdimRange, items: Signal[], news: WdimNews[], markets: WdimMarket[]): string {
  const marketLines = markets
    .map((m) => `- ${m.name}: ${m.price.toLocaleString("en-GB")} (${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(2)} per cent)`)
    .join("\n");
  const newsLines = news
    .map((n) => `- (${n.category || "news"}) "${n.title}" | ${n.source}`)
    .join("\n");
  const signalLines = items
    .map((s) => `- [${s.source}] ${s.heading || ""}: ${snippet(s)}`)
    .join("\n");

  return [
    `You are a sharp intelligence analyst producing the "What Did I Miss?" briefing for a time-poor UK business leader, covering the ${RANGE_LABEL[range]}.`,
    ``,
    `Return ONLY a JSON object — no prose, no markdown fences — with this exact shape:`,
    `{`,
    `  "economy":    { "data": "...", "insight": "...", "pieces": [ {"title":"...","source":"...","focus":"..."}, {"title":"...","source":"...","focus":"..."}, {"title":"...","source":"...","focus":"..."} ] },`,
    `  "consumers":  { "data": "...", "insight": "...", "pieces": [ ...3 items... ] },`,
    `  "technology": { "data": "...", "insight": "...", "pieces": [ ...3 items... ] }`,
    `}`,
    ``,
    `RULES:`,
    `- UK English exclusively: per cent, categorise, behaviour, prioritising, whilst.`,
    `- NEVER use em dashes. Use colons, semicolons or parentheses instead.`,
    `- No advice, no prescription: never write "you should", "watch", "action required" or "we recommend".`,
    `- No meta-commentary, no filler, no references to this briefing, the source list or the analyst.`,
    `- NEVER count source items or outlets. Never write "X of Y stories", "N articles featured", "led by [outlet]" or anything that describes the data set rather than the world.`,
    `- "data": 1-2 sentences. Open with a specific, hard data point — an exact number, percentage, price level, named metric or concrete event — drawn from the source items. A second sentence may add a comparison, a named actor or immediate context. Do NOT use vague adjectives ("rapidly growing", "cooling") without an anchoring figure. Do NOT invent statistics, institutions or reports.`,
    `- "insight": 2-3 sentences. The structural, strategic or market implication. Offer a sharp analytical interpretation: what is this a sign of, what shift does it signal, what is the underlying dynamic or consequence. Be direct and opinionated. Do NOT merely restate the data or describe what happened.`,
    `- "pieces": EXACTLY three items, each a REAL entry from the SOURCE ITEMS below. Copy title and source verbatim. "focus" is a factual note of at most 15 words adding context beyond the headline.`,
    `- If items genuinely lack a hard figure for a category, use the most concrete factual statement present; never fabricate one.`,
    `- ${RANGE_DENSITY[range]}`,
    ``,
    `SOURCE ITEMS`,
    ``,
    `[MARKET INDICES]`,
    marketLines || "(none)",
    ``,
    `[BUSINESS / MARKET NEWS]`,
    newsLines || "(none)",
    ``,
    `[EXPERT SIGNALS]`,
    signalLines || "(none)",
  ].join("\n");
}

function parseSections(raw: string): WdimSections | null {
  if (!raw) return null;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  text = text.slice(a, b + 1);
  try {
    const o = JSON.parse(text);
    const ok = (s: unknown): s is WdimSection =>
      !!s &&
      typeof (s as WdimSection).data === "string" &&
      typeof (s as WdimSection).insight === "string" &&
      Array.isArray((s as WdimSection).pieces);
    if (ok(o.economy) && ok(o.consumers) && ok(o.technology)) {
      const clean = (sec: WdimSection): WdimSection => ({
        data: sec.data.trim(),
        insight: sec.insight.trim(),
        pieces: sec.pieces.slice(0, 3).map((p) => ({
          title: String(p.title || "").trim(),
          source: String(p.source || "").trim(),
          focus: String(p.focus || "").trim(),
        })),
      });
      return { economy: clean(o.economy), consumers: clean(o.consumers), technology: clean(o.technology) };
    }
  } catch { /* fall through */ }
  return null;
}

// 1) Claude Code CLI — uses the user's existing subscription, no API key needed.
// Defaults to Haiku for speed; override via WDIM_MODEL env var.
function tryClaudeCli(prompt: string): Promise<string | null> {
  const bin = process.env.WDIM_CLAUDE_BIN || "claude";
  const model = process.env.WDIM_MODEL || "claude-haiku-4-5-20251001";
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, ["-p", "--model", model], { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      resolve(null);
      return;
    }
    let out = "", err = "";
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(null); }, 120_000);
    child.stdout.on("data", (d: Buffer) => (out += d));
    child.stderr.on("data", (d: Buffer) => (err += d));
    child.on("error", () => { clearTimeout(timer); resolve(null); });
    child.on("close", (code: number | null) => {
      clearTimeout(timer);
      const text = out.trim();
      resolve(code === 0 && text ? text : null);
      void err;
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

// 2) Anthropic API — if ANTHROPIC_API_KEY is set in .env.local.
async function tryApi(prompt: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.WDIM_MODEL || "claude-haiku-4-5",
        max_tokens: 1800,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const text = (j?.content ?? []).map((b: { text?: string }) => b.text || "").join("").trim();
    return text || null;
  } catch {
    return null;
  }
}

// Returns null when no LLM is available or when the response can't be parsed.
// The route maps null → { available: false } so the home module hides cleanly.
export async function generateWdim(
  range: WdimRange,
  news: WdimNews[] = [],
  markets: WdimMarket[] = [],
): Promise<WdimResult | null> {
  const items = gather(range);
  const urlMap = buildUrlMap(items, news);
  const prompt = buildPrompt(range, items, news, markets);

  const cli = await tryClaudeCli(prompt);
  const cliSections = parseSections(cli || "");
  if (cliSections) {
    return { range, mode: "claude-cli", sections: attachUrls(cliSections, urlMap), generatedAt: new Date().toISOString() };
  }

  const api = await tryApi(prompt);
  const apiSections = parseSections(api || "");
  if (apiSections) {
    return { range, mode: "api", sections: attachUrls(apiSections, urlMap), generatedAt: new Date().toISOString() };
  }

  return null;
}

export function wdimReady(): boolean {
  try { return getSignals().length > 0; } catch { return false; }
}

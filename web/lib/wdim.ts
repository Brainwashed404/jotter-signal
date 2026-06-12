// "What Did I Miss?" (WDIM) — LOCAL PROTOTYPE, server-only.
//
// Produces a structured executive briefing: macro indicator, global
// developments, expert perspectives, and strategic context directives.
// Audience-aware (B2B / B2C) and timeframe-aware (day / week / month).
//
// Generator order:
//   1. ANTHROPIC_API_KEY (tool use — guaranteed structured output, preferred)
//   2. claude CLI (Claude Code) — uses your existing subscription, JSON prompt fallback
//
// Returns null when no LLM is available. The route maps null to { available: false }
// so the home module disappears cleanly rather than showing placeholder copy.
//
// Gated OFF in production (see app/api/wdim/route.ts).
import "server-only";
import { spawn } from "node:child_process";
import { recentForSynthesis, getSignals } from "./data";
import type { Signal } from "./types";

export type WdimRange = "day" | "week" | "month";
export type WdimAudience = "b2b" | "b2c";

export type WdimDevelopment = {
  headline: string;
  summary: string;
  url?: string;
};

export type WdimExpertPerspective = {
  thesis: string;
  source: string;
  snippet: string;
  url?: string;
};

export type WdimDirective = {
  action: string;
};

export type WdimBriefing = {
  macroIndicator: string;
  developments: WdimDevelopment[];
  expertPerspectives: WdimExpertPerspective[];
  directives: WdimDirective[];
};

export type WdimNews = { title: string; source: string; category?: string; url?: string };
export type WdimMarket = { name: string; price: number; changePct: number };

export type WdimResult = {
  range: WdimRange;
  audience: WdimAudience;
  mode: "claude-cli" | "api";
  briefing: WdimBriefing;
  generatedAt: string;
};

const RANGE_LABEL: Record<WdimRange, string> = {
  day: "past 24 hours",
  week: "past 7 days",
  month: "past 30 days",
};

const AUDIENCE_CONTEXT: Record<WdimAudience, {
  label: string;
  focus: string;
  timeframes: Record<WdimRange, string>;
}> = {
  b2b: {
    label: "B2B enterprise professionals",
    focus: "pipeline velocity, buying committee dynamics, enterprise SaaS procurement, seat-to-usage billing transitions, cloud compute infrastructure costs, software credit billing, corporate headcount restructuring, and data privacy and regional compliance regulations",
    timeframes: {
      day: "Immediate 24-hour tactical updates: transport bottlenecks affecting industrial supply chains, corporate seat downsizing announcements, software billing credit updates, enterprise security incidents.",
      week: "7-day tactical shifts: major platform IPO or valuation news, decline in enterprise lead quality indicators, compute cost surges, automated inbox filtering changes, procurement policy updates.",
      month: "30-day structural changes: seat-to-usage-based billing transitions across major SaaS vendors, technological labour mobility patterns, data privacy legislation developments, emergence of private peer evaluation directories.",
    },
  },
  b2c: {
    label: "B2C brand and marketing professionals",
    focus: "retail conversion rates, digital advertising ROI, third-party cookie deprecation, programmatic tracking efficiency, direct brand equity building, Answer Engine Optimisation (AEO), organic search CTR trends, and migration of audiences to high-trust private communities",
    timeframes: {
      day: "Immediate 24-hour tactical updates: global events affecting consumer sentiment, freight cost impacts on retail pricing, e-commerce checkout transaction fee changes, platform algorithm shifts.",
      week: "7-day tactical shifts: technology valuation swings affecting ad budgets, organic search CTR collapses due to AI-generated summaries, regulatory audits of cookie-tracking pixels, major brand campaign launches.",
      month: "30-day structural changes: cookieless targeting transitions, mass-market programmatic ROI decline, younger audience migration from search to direct conversational answers, community platform consolidation.",
    },
  },
};

function snippet(s: Signal, n = 200): string {
  const t = (s.text || "")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > n ? t.slice(0, n).trimEnd() + "..." : t;
}

// Each range draws from a DISJOINT time window so day/week/month briefings can never
// surface the same signal: day = the last ~2 days, week = 2 to 8 days ago, month = 8
// to 31 days ago. (Combined with cross-range dedup in the bundle, this guarantees the
// three timeframes show entirely original material.)
const RANGE_WINDOW: Record<WdimRange, { days: number; minDays: number; limit: number }> = {
  day: { days: 2, minDays: 0, limit: 20 },
  week: { days: 8, minDays: 2, limit: 30 },
  month: { days: 31, minDays: 8, limit: 40 },
};

function gather(range: WdimRange): Signal[] {
  const w = RANGE_WINDOW[range];
  return recentForSynthesis(w.days, w.limit, w.minDays);
}

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

function attachUrls(briefing: WdimBriefing, urlMap: Map<string, string>): WdimBriefing {
  const norm = (s: string) =>
    s.toLowerCase().trim().replace(/[""'']/g, '"').replace(/\s+/g, " ");
  return {
    ...briefing,
    developments: briefing.developments.map((d) => ({
      ...d,
      url: d.url || urlMap.get(norm(d.headline)),
    })),
    expertPerspectives: briefing.expertPerspectives.map((p) => ({
      ...p,
      url: p.url || urlMap.get(norm(p.thesis)),
    })),
  };
}

// Tool schema for Anthropic API function calling.
// tool_choice: { type: "tool", name: "generate_briefing" } forces exclusive structured output.
const GENERATE_BRIEFING_TOOL = {
  name: "generate_briefing",
  description: "Generate a structured intelligence briefing with macro indicator, global developments, expert perspectives, and strategic context directives.",
  input_schema: {
    type: "object" as const,
    properties: {
      macro_indicator: {
        type: "string",
        description: "1-2 sentences. Broader macro context: a geopolitical, technological, regulatory, societal or economic development shaping the current environment. Must open with a concrete named development, data point, or actor. A second sentence may add scale or context. UK English, no em dashes.",
      },
      developments: {
        type: "array",
        description: "Exactly 4 high-density analytical summaries of the most important global developments relevant to the audience. No two items may share the same source publication. Headlines must be copied verbatim from the source material.",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            headline: {
              type: "string",
              description: "Precise headline copied verbatim from NEWS HEADLINES or EXPERT SIGNALS inputs.",
            },
            summary: {
              type: "string",
              description: "2-3 analytical sentences on why this development matters to the audience. UK English, no em dashes.",
            },
            url: {
              type: "string",
              description: "Copy the URL verbatim from the source data if provided (the '| URL: ...' field). Omit if not available.",
            },
            source: {
              type: "string",
              description: "The publication or source name for this development.",
            },
          },
          required: ["headline", "summary"],
        },
      },
      expert_perspectives: {
        type: "array",
        description: "Exactly 4 expert perspectives drawn from the EXPERT SIGNALS. Each thesis title must be copied verbatim from the signals so a URL can be attached, and must not duplicate any development headline. Cards link directly to the source Substack publication.",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            thesis: {
              type: "string",
              description: "The expert's central argument or article heading, copied verbatim from EXPERT SIGNALS.",
            },
            source: {
              type: "string",
              description: "The expert or publication name as it appears in the signal.",
            },
            snippet: {
              type: "string",
              description: "Factual context note of at most 15 words beyond the thesis title.",
            },
            url: {
              type: "string",
              description: "Copy the URL verbatim from EXPERT SIGNALS if provided (the '| URL: ...' field). Omit if not available.",
            },
          },
          required: ["thesis", "source", "snippet"],
        },
      },
      directives: {
        type: "array",
        description: "3-4 forward-looking talking points (thought starters) that extrapolate the WIDER themes running through this briefing into useful preparation prompts for business leaders. Each connects a macro shift to a concrete consideration for the reader's own organisation. Do not tie a thought starter to a single narrow story: synthesise the broader pattern. This is the only place prescriptive or second-person language is allowed.",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description: "A forward-looking talking point that helps a leader prepare for what is coming. Open by naming the wider shift or theme, then turn it into a concrete consideration or question for the reader's own organisation. One or two sentences; a rhetorical question is encouraged. Example: 'With corporations moving beyond basic enterprise access to AI tools, have you factored a CPU-token budget into your planning yet?' UK English, no em dashes, plain language.",
            },
          },
          required: ["action"],
        },
      },
    },
    required: ["macro_indicator", "developments", "expert_perspectives", "directives"],
  },
};

function buildSystemPrompt(range: WdimRange, audience: WdimAudience, excludeTitles: string[] = []): string {
  const ctx = AUDIENCE_CONTEXT[audience];
  const lines = [
    `You are a precise intelligence analyst for Jotter Intelligence, producing structured briefings for ${ctx.label}.`,
    `Your focus for this audience: ${ctx.focus}.`,
    `Timeframe context (${RANGE_LABEL[range]}): ${ctx.timeframes[range]}`,
    ``,
    `STRICT RULES:`,
    `- UK English exclusively: per cent, categorise, behaviour, prioritising, whilst, organisation.`,
    `- NEVER use em dashes (never output: —). Use colons, commas, or parentheses instead.`,
    `- The macro_indicator, developments, and expert_perspectives must be analytical and non-prescriptive: never "you should", "watch for", "we recommend". The DIRECTIVES (thought starters) are the only exception: there, extrapolate the briefing's WIDER themes into forward-looking talking points that help a leader prepare, each linking a macro shift to a concrete consideration for the reader's organisation (a rhetorical question is welcome). Never tie a thought starter to one narrow story.`,
    `- No meta-commentary or filler. Do not reference this briefing, the source list, or the analyst.`,
    `- macro_indicator must open with a concrete named development, data point, or actor. It describes the broader macro environment (geopolitical, technological, regulatory, societal or economic context), not only financial markets. Do not fabricate statistics or institutions.`,
    `- development headlines and expert_perspective thesis values must be copied verbatim from the source material provided.`,
    `- A development headline and an expert_perspective thesis must never be the same item: never repeat a title across the two zones.`,
    `- For developments, include no more than one item per source publication. If the same publication appears multiple times, pick the most relevant item only.`,
    `- Copy URLs verbatim from the source data where provided. Never fabricate or modify URLs.`,
    `- If source items lack a hard figure for the macro indicator, use the most concrete factual statement present.`,
  ];
  if (excludeTitles.length) {
    lines.push(
      ``,
      `ALREADY SHOWN ELSEWHERE (do NOT reuse these headlines, theses, or their stories — choose entirely different material):`,
      ...excludeTitles.slice(0, 60).map((t) => `- ${t}`),
    );
  }
  return lines.join("\n");
}

function buildUserMessage(
  range: WdimRange,
  audience: WdimAudience,
  items: Signal[],
  news: WdimNews[],
  markets: WdimMarket[],
  custom?: string,
): string {
  const marketLines = markets
    .map((m) => `- ${m.name}: ${m.price.toLocaleString("en-GB")} (${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(2)} per cent)`)
    .join("\n");
  const newsLines = news
    .map((n) => `- (${n.category || "news"}) "${n.title}" | ${n.source}${n.url ? ` | URL: ${n.url}` : ""}`)
    .join("\n");
  const signalLines = items
    .map((s) => `- [${s.source}] "${s.heading || ""}" | ${snippet(s)}${s.post_url ? ` | URL: ${s.post_url}` : ""}`)
    .join("\n");

  const parts = [
    `Generate a ${RANGE_LABEL[range]} intelligence briefing for ${AUDIENCE_CONTEXT[audience].label}.`,
    ``,
    `[MARKET INDICES]`,
    marketLines || "(none)",
    ``,
    `[NEWS HEADLINES]`,
    newsLines || "(none)",
    ``,
    `[EXPERT SIGNALS]`,
    signalLines || "(none)",
  ];

  if (custom && custom.trim()) {
    parts.push(``, `[ADDITIONAL CONTEXT]`, custom.trim());
  }

  return parts.join("\n");
}

// CLI fallback: merge system + user into one prompt with explicit JSON schema.
function buildCliPrompt(
  range: WdimRange,
  audience: WdimAudience,
  items: Signal[],
  news: WdimNews[],
  markets: WdimMarket[],
  custom?: string,
  excludeTitles: string[] = [],
): string {
  const system = buildSystemPrompt(range, audience, excludeTitles);
  const user = buildUserMessage(range, audience, items, news, markets, custom);
  const schema = `{"macro_indicator":"...","developments":[{"headline":"...","summary":"...","url":"...","source":"..."}],"expert_perspectives":[{"thesis":"...","source":"...","snippet":"...","url":"..."}],"directives":[{"action":"..."}]}`;
  return [
    system,
    ``,
    `OUTPUT FORMAT: Return ONLY a raw JSON object matching this schema exactly. No markdown fences, no preamble, no postscript:`,
    schema,
    ``,
    user,
  ].join("\n");
}

function parseBriefingFromJson(raw: string): WdimBriefing | null {
  if (!raw) return null;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  text = text.slice(a, b + 1);
  try {
    const o = JSON.parse(text);
    if (
      typeof o.macro_indicator !== "string" ||
      !Array.isArray(o.developments) ||
      !Array.isArray(o.expert_perspectives) ||
      !Array.isArray(o.directives)
    ) return null;
    return normaliseBriefing(o);
  } catch { return null; }
}

function normaliseBriefing(o: {
  macro_indicator?: string;
  developments?: { headline?: string; summary?: string; url?: string; source?: string }[];
  expert_perspectives?: { thesis?: string; source?: string; snippet?: string; url?: string }[];
  directives?: { action?: string }[];
}): WdimBriefing | null {
  if (!o.macro_indicator || !o.developments || !o.expert_perspectives || !o.directives) return null;
  const seenSources = new Set<string>();
  return {
    macroIndicator: String(o.macro_indicator).trim(),
    developments: (o.developments)
      .filter((d) => {
        if (!d.headline || !d.summary) return false;
        const src = (d.source || "").toLowerCase().trim();
        if (src && seenSources.has(src)) return false;
        if (src) seenSources.add(src);
        return true;
      })
      .slice(0, 4)
      .map((d) => ({
        headline: String(d.headline).trim(),
        summary: String(d.summary).trim(),
        ...(d.url ? { url: String(d.url).trim() } : {}),
      })),
    expertPerspectives: (o.expert_perspectives)
      .filter((p) => p.thesis && p.source)
      .slice(0, 4)
      .map((p) => ({
        thesis: String(p.thesis).trim(),
        source: String(p.source).trim(),
        snippet: String(p.snippet || "").trim(),
        ...(p.url ? { url: String(p.url).trim() } : {}),
      })),
    directives: (o.directives)
      .filter((d) => d.action)
      .slice(0, 5)
      .map((d) => ({ action: String(d.action).trim() })),
  };
}

// 1. Anthropic API with tool use (preferred: guaranteed structured output).
async function tryApiToolUse(systemPrompt: string, userMessage: string): Promise<WdimBriefing | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.WDIM_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        tools: [GENERATE_BRIEFING_TOOL],
        tool_choice: { type: "tool", name: "generate_briefing" },
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const toolUse = (j?.content ?? []).find(
      (b: { type: string }) => b.type === "tool_use",
    ) as { input?: {
      macro_indicator?: string;
      developments?: { headline: string; summary: string }[];
      expert_perspectives?: { thesis: string; source: string; snippet: string }[];
      directives?: { action: string }[];
    } } | undefined;
    if (!toolUse?.input) return null;
    return normaliseBriefing(toolUse.input);
  } catch { return null; }
}

// 2. Claude Code CLI (uses existing subscription, JSON-prompt fallback).
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

export async function generateWdim(
  range: WdimRange,
  audience: WdimAudience,
  news: WdimNews[] = [],
  markets: WdimMarket[] = [],
  custom?: string,
  excludeTitles: string[] = [],
): Promise<WdimResult | null> {
  const items = gather(range);
  const urlMap = buildUrlMap(items, news);

  // API with tool use preferred (eliminates parsing errors).
  const systemPrompt = buildSystemPrompt(range, audience, excludeTitles);
  const userMessage = buildUserMessage(range, audience, items, news, markets, custom);
  const apiBriefing = await tryApiToolUse(systemPrompt, userMessage);
  if (apiBriefing) {
    return {
      range, audience, mode: "api",
      briefing: attachUrls(apiBriefing, urlMap),
      generatedAt: new Date().toISOString(),
    };
  }

  // CLI fallback.
  const cliPrompt = buildCliPrompt(range, audience, items, news, markets, custom, excludeTitles);
  const cliRaw = await tryClaudeCli(cliPrompt);
  const cliBriefing = parseBriefingFromJson(cliRaw || "");
  if (cliBriefing) {
    return {
      range, audience, mode: "claude-cli",
      briefing: attachUrls(cliBriefing, urlMap),
      generatedAt: new Date().toISOString(),
    };
  }

  return null;
}

// Normalise a title for dedup: lowercase, strip punctuation, collapse whitespace.
function titleKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// Remove any development headline or expert-perspective thesis whose title has
// already appeared (in this set or in `seen`). Mutates `seen`. Used to guarantee
// every story is unique across the day/week/month bundle AND across both zones.
function dedupeBriefing(b: WdimBriefing, seen: Set<string>): WdimBriefing {
  const keepUnique = <T extends { headline?: string; thesis?: string }>(
    arr: T[],
    pick: (x: T) => string,
  ): T[] => {
    const out: T[] = [];
    for (const it of arr) {
      const k = titleKey(pick(it));
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(it);
    }
    return out;
  };
  return {
    ...b,
    developments: keepUnique(b.developments, (d) => d.headline),
    expertPerspectives: keepUnique(b.expertPerspectives, (p) => p.thesis).slice(0, 4),
  };
}

/**
 * Generate a full per-audience bundle (day + week + month) in parallel, then
 * dedupe across the three so no headline or thesis ever repeats between ranges
 * or zones. News only feeds the `day` range (it is "now" material); week/month
 * developments come from their own disjoint signal windows. `excludeTitles`
 * (the other audience's titles) is passed to every range as a soft exclusion so
 * the two audiences diverge too.
 */
export async function generateWdimBundle(
  audience: WdimAudience,
  news: WdimNews[] = [],
  markets: WdimMarket[] = [],
  excludeTitles: string[] = [],
): Promise<Record<WdimRange, WdimResult> | null> {
  const [day, week, month] = await Promise.all([
    generateWdim("day", audience, news, markets, undefined, excludeTitles),
    generateWdim("week", audience, [], markets, undefined, excludeTitles),
    generateWdim("month", audience, [], markets, undefined, excludeTitles),
  ]);
  if (!day && !week && !month) return null;

  // Dedupe in day -> week -> month order so the freshest range keeps a contested
  // story and the broader ranges fall back to their own distinct material.
  const seen = new Set<string>(excludeTitles.map(titleKey).filter(Boolean));
  const out = {} as Record<WdimRange, WdimResult>;
  for (const r of ["day", "week", "month"] as WdimRange[]) {
    const res = r === "day" ? day : r === "week" ? week : month;
    if (!res) continue;
    out[r] = { ...res, briefing: dedupeBriefing(res.briefing, seen) };
  }
  return Object.keys(out).length ? out : null;
}

// Collect every development headline + perspective thesis from a bundle, for use
// as the cross-audience exclusion list.
export function bundleTitles(bundle: Record<string, WdimResult>): string[] {
  const out: string[] = [];
  for (const res of Object.values(bundle)) {
    if (!res?.briefing) continue;
    for (const d of res.briefing.developments) out.push(d.headline);
    for (const p of res.briefing.expertPerspectives) out.push(p.thesis);
  }
  return out;
}

export function wdimReady(): boolean {
  try { return getSignals().length > 0; } catch { return false; }
}

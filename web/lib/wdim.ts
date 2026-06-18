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

// No emojis anywhere on the site: strip pictographic emoji from generated copy.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]+/gu;
function clean(s: unknown): string {
  return String(s ?? "").replace(EMOJI_RE, "").replace(/ {2,}/g, " ").trim();
}

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

// Shared briefing schema (one audience's brief), reused by the single and dual tools.
const BRIEFING_PROPS = {
  macro_indicator: {
    type: "string",
    description: "1-2 sentences. Broader macro context relevant to THIS audience: a geopolitical, technological, regulatory, societal or economic development shaping their environment. Must open with a concrete named development, data point, or actor. UK English, no em dashes.",
  },
  developments: {
    type: "array",
    description: "Exactly 4 high-density analytical summaries of the developments that THIS audience's leaders most need to know. No two items may share the same source publication. Headlines copied verbatim from the source material.",
    minItems: 2,
    maxItems: 4,
    items: {
      type: "object",
      properties: {
        headline: { type: "string", description: "Precise headline copied verbatim from NEWS HEADLINES or EXPERT SIGNALS inputs." },
        summary: { type: "string", description: "2-3 analytical sentences on the concrete operational, commercial, or regulatory implication for THIS audience's sector. UK English, no em dashes." },
        url: { type: "string", description: "Copy the URL verbatim from the source data if provided (the '| URL: ...' field). Omit if not available." },
        source: { type: "string", description: "The publication or source name for this development." },
      },
      required: ["headline", "summary"],
    },
  },
  expert_perspectives: {
    type: "array",
    description: "Exactly 4 expert perspectives from the EXPERT SIGNALS most relevant to THIS audience. Each thesis title copied verbatim from the signals; must not duplicate any development headline.",
    minItems: 2,
    maxItems: 4,
    items: {
      type: "object",
      properties: {
        thesis: { type: "string", description: "The expert's central argument or article heading, copied verbatim from EXPERT SIGNALS." },
        source: { type: "string", description: "The expert or publication name as it appears in the signal." },
        snippet: { type: "string", description: "Factual context note of at most 15 words beyond the thesis title, angled at why it matters to THIS audience." },
        url: { type: "string", description: "Copy the URL verbatim from EXPERT SIGNALS if provided (the '| URL: ...' field). Omit if not available." },
      },
      required: ["thesis", "source", "snippet"],
    },
  },
  directives: {
    type: "array",
    description: "3-4 forward-looking talking points (thought starters) that extrapolate the WIDER themes of THIS audience's brief into useful preparation prompts for their leaders. Each connects a macro shift to a concrete consideration for the reader's own organisation. Synthesise the broader pattern, do not tie to one narrow story. The only place prescriptive or second-person language is allowed.",
    minItems: 2,
    maxItems: 4,
    items: {
      type: "object",
      properties: {
        action: { type: "string", description: "A forward-looking talking point that helps a leader prepare for what is coming. Name the wider shift, then turn it into a concrete consideration or question for the reader's organisation. One or two sentences; a rhetorical question is encouraged. Example: 'With corporations moving beyond basic enterprise access to AI tools, have you factored a CPU-token budget into your planning yet?' UK English, no em dashes." },
      },
      required: ["action"],
    },
  },
} as const;
const BRIEFING_REQUIRED = ["macro_indicator", "developments", "expert_perspectives", "directives"];

// Single-audience tool (used by custom queries).
const GENERATE_BRIEFING_TOOL = {
  name: "generate_briefing",
  description: "Generate a structured intelligence briefing with macro indicator, global developments, expert perspectives, and strategic context directives.",
  input_schema: { type: "object" as const, properties: BRIEFING_PROPS, required: BRIEFING_REQUIRED },
};

// Dual-audience tool: ONE call produces BOTH the B2B and B2C briefings from the same
// source material, so the model partitions each story to the audience it best serves
// instead of two independent calls both grabbing the same big headlines.
const GENERATE_DUAL_TOOL = {
  name: "generate_dual_briefing",
  description: "Generate TWO distinct intelligence briefings from the same source material: one for B2B enterprise leaders, one for B2C brand and marketing leaders. Each story belongs to ONE audience only.",
  input_schema: {
    type: "object" as const,
    properties: {
      b2b: { type: "object", description: "Briefing for B2B enterprise leaders.", properties: BRIEFING_PROPS, required: BRIEFING_REQUIRED },
      b2c: { type: "object", description: "Briefing for B2C brand and marketing leaders.", properties: BRIEFING_PROPS, required: BRIEFING_REQUIRED },
    },
    required: ["b2b", "b2c"],
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
    `- NEVER use em dashes (never output: —). Use colons, commas, or parentheses instead. Never use emojis.`,
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

// Sources removed from the studio that must NEVER be attributed in a briefing — even when a
// curated expert quotes or links them, the model otherwise lifts the name out of the source
// text and resurrects them as a voice. Matched (substring, case-insensitive) on the `source`.
const BLOCKED_SOURCES = ["benedict evans", "ben evans", "ben-evans", "benedictevans"];
function isBlockedSource(src?: string): boolean {
  const s = (src || "").toLowerCase();
  return BLOCKED_SOURCES.some((b) => s.includes(b));
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
    macroIndicator: clean(o.macro_indicator),
    developments: (o.developments)
      .filter((d) => {
        if (!d.headline || !d.summary) return false;
        if (isBlockedSource(d.source)) return false;
        const src = (d.source || "").toLowerCase().trim();
        if (src && seenSources.has(src)) return false;
        if (src) seenSources.add(src);
        return true;
      })
      .slice(0, 4)
      .map((d) => ({
        headline: clean(d.headline),
        summary: clean(d.summary),
        ...(d.url ? { url: String(d.url).trim() } : {}),
      })),
    expertPerspectives: (o.expert_perspectives)
      .filter((p) => p.thesis && p.source && !isBlockedSource(p.source))
      .slice(0, 4)
      .map((p) => ({
        thesis: clean(p.thesis),
        source: clean(p.source),
        snippet: clean(p.snippet),
        ...(p.url ? { url: String(p.url).trim() } : {}),
      })),
    directives: (o.directives)
      .filter((d) => d.action)
      .slice(0, 5)
      .map((d) => ({ action: clean(d.action) })),
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
        model: process.env.WDIM_MODEL || "claude-sonnet-4-6",
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
  const model = process.env.WDIM_MODEL || "claude-sonnet-4-6";
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, ["-p", "--model", model], { stdio: ["pipe", "pipe", "pipe"] });
    } catch {
      resolve(null);
      return;
    }
    let out = "", err = "";
    const timer = setTimeout(() => { try { child.kill(); } catch {} resolve(null); }, 200_000);
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

// ─── Dual-audience generation (the real fix for repetitive B2B/B2C briefs) ──────
// Both audiences are produced from the SAME material in ONE call so the model
// partitions each story to the audience it best serves, instead of two independent
// calls each grabbing the biggest headlines. Sharp sector lenses below make the two
// briefs genuinely different (enterprise buying/infra/compliance vs consumer/brand/ads).
const AUDIENCE_BRIEF: Record<WdimAudience, { label: string; needs: string; avoid: string }> = {
  b2b: {
    label: "B2B enterprise leaders (heads of sales, RevOps, procurement, IT, product at companies that sell to other businesses)",
    needs: "enterprise software spend and procurement cycles, vendor consolidation and lock-in, seat-vs-usage and token-based billing shifts, cloud and compute cost structures, enterprise security and data-compliance/regulation, the technical labour market, B2B demand and pipeline signals, and M&A across the enterprise stack",
    avoid: "consumer-sentiment, retail-pricing, social-platform and advertising angles (those belong to the B2C brief)",
  },
  b2c: {
    label: "B2C brand and marketing leaders (CMOs, brand, growth, performance marketing, e-commerce at consumer-facing companies)",
    needs: "consumer spending and sentiment, retail and e-commerce, advertising effectiveness (programmatic, cookie deprecation, Answer Engine Optimisation, organic search CTR), social platforms and algorithm shifts, the creator economy, brand trust and cultural shifts, payments and checkout, and consumer-privacy regulation",
    avoid: "enterprise procurement, infrastructure-cost and B2B-compliance angles (those belong to the B2B brief)",
  },
};

function buildDualSystemPrompt(range: WdimRange): string {
  return [
    `You are a precise intelligence analyst for Jotter Intelligence. From ONE set of source material you produce TWO separate briefings for the ${RANGE_LABEL[range]}:`,
    `- b2b: for ${AUDIENCE_BRIEF.b2b.label}. They need: ${AUDIENCE_BRIEF.b2b.needs}. In the B2B brief, avoid ${AUDIENCE_BRIEF.b2b.avoid}.`,
    `- b2c: for ${AUDIENCE_BRIEF.b2c.label}. They need: ${AUDIENCE_BRIEF.b2c.needs}. In the B2C brief, avoid ${AUDIENCE_BRIEF.b2c.avoid}.`,
    ``,
    `THE TWO BRIEFS MUST BE GENUINELY DIFFERENT:`,
    `- Assign each story, development and expert perspective to the ONE audience it most serves. A development headline or expert thesis must NEVER appear in both briefs.`,
    `- When a story matters to both audiences, put it in the more relevant brief and give the OTHER brief a different story (dig deeper into the material), not the same story reframed.`,
    `- Each brief should surface what THAT sector's leaders genuinely need in order to make decisions, not the generic tech headlines everyone has already seen. Prefer concrete operational, commercial and regulatory implications for that sector.`,
    ``,
    `STRICT RULES (apply to BOTH briefs):`,
    `- UK English exclusively: per cent, categorise, behaviour, prioritising, whilst, organisation.`,
    `- NEVER use em dashes (never output a long dash). Use colons, commas, or parentheses instead. Never use emojis.`,
    `- macro_indicator, developments and expert_perspectives must be analytical and non-prescriptive (never "you should", "we recommend"). The DIRECTIVES (thought starters) are the only place for forward-looking, second-person prompts.`,
    `- development headlines and expert_perspective thesis values must be copied VERBATIM from the source material provided. Never invent a headline.`,
    `- A development headline and an expert_perspective thesis must never be the same item.`,
    `- No more than one development per source publication within a brief.`,
    `- Copy URLs verbatim from the source data where provided; never fabricate URLs.`,
    `- No meta-commentary. Do not reference this briefing, the source list, or the analyst.`,
  ].join("\n");
}

// Audience-neutral material dump (the dual prompt assigns it to the two briefs).
function buildDualUserMessage(range: WdimRange, items: Signal[], news: WdimNews[], markets: WdimMarket[]): string {
  const marketLines = markets
    .map((m) => `- ${m.name}: ${m.price.toLocaleString("en-GB")} (${m.changePct >= 0 ? "+" : ""}${m.changePct.toFixed(2)} per cent)`)
    .join("\n");
  const newsLines = news
    .map((n) => `- (${n.category || "news"}) "${n.title}" | ${n.source}${n.url ? ` | URL: ${n.url}` : ""}`)
    .join("\n");
  const signalLines = items
    .map((s) => `- [${s.source}] "${s.heading || ""}" | ${snippet(s)}${s.post_url ? ` | URL: ${s.post_url}` : ""}`)
    .join("\n");
  return [
    `Produce the b2b and b2c ${RANGE_LABEL[range]} briefings from this material. Split the stories between the two briefs so neither repeats the other.`,
    ``, `[MARKET INDICES]`, marketLines || "(none)",
    ``, `[NEWS HEADLINES]`, newsLines || "(none)",
    ``, `[EXPERT SIGNALS]`, signalLines || "(none)",
  ].join("\n");
}

type DualInput = { b2b?: Parameters<typeof normaliseBriefing>[0]; b2c?: Parameters<typeof normaliseBriefing>[0] };
function normaliseDual(o: DualInput): { b2b: WdimBriefing; b2c: WdimBriefing } | null {
  const b2b = o.b2b ? normaliseBriefing(o.b2b) : null;
  const b2c = o.b2c ? normaliseBriefing(o.b2c) : null;
  if (!b2b || !b2c) return null;
  return { b2b, b2c };
}

async function tryApiDual(system: string, user: string): Promise<{ b2b: WdimBriefing; b2c: WdimBriefing } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.WDIM_MODEL || "claude-sonnet-4-6",
        max_tokens: 4096,
        system,
        tools: [GENERATE_DUAL_TOOL],
        tool_choice: { type: "tool", name: "generate_dual_briefing" },
        messages: [{ role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const toolUse = (j?.content ?? []).find((b: { type: string }) => b.type === "tool_use") as { input?: DualInput } | undefined;
    if (!toolUse?.input) return null;
    return normaliseDual(toolUse.input);
  } catch { return null; }
}

function buildDualCliPrompt(range: WdimRange, items: Signal[], news: WdimNews[], markets: WdimMarket[]): string {
  const schema = `{"b2b":{"macro_indicator":"...","developments":[{"headline":"...","summary":"...","url":"...","source":"..."}],"expert_perspectives":[{"thesis":"...","source":"...","snippet":"...","url":"..."}],"directives":[{"action":"..."}]},"b2c":{ ...same shape ... }}`;
  return [
    buildDualSystemPrompt(range),
    ``,
    `OUTPUT FORMAT: Return ONLY a raw JSON object matching this schema exactly (both b2b and b2c). No markdown fences, no preamble:`,
    schema,
    ``,
    buildDualUserMessage(range, items, news, markets),
  ].join("\n");
}

function parseDualFromJson(raw: string): { b2b: WdimBriefing; b2c: WdimBriefing } | null {
  if (!raw) return null;
  let text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const a = text.indexOf("{"); const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  text = text.slice(a, b + 1);
  try { return normaliseDual(JSON.parse(text) as DualInput); } catch { return null; }
}

// Generate both audiences' briefings for ONE range (disjoint window). News only feeds
// the `day` range; week/month draw developments from their own windowed signals.
async function generateWdimRange(
  range: WdimRange,
  news: WdimNews[],
  markets: WdimMarket[],
): Promise<{ b2b: WdimResult; b2c: WdimResult } | null> {
  const items = gather(range);
  const rangeNews = range === "day" ? news : [];
  const urlMap = buildUrlMap(items, rangeNews);
  const system = buildDualSystemPrompt(range);
  const user = buildDualUserMessage(range, items, rangeNews, markets);

  let dual = await tryApiDual(system, user);
  let mode: WdimResult["mode"] = "api";
  if (!dual) {
    const raw = await tryClaudeCli(buildDualCliPrompt(range, items, rangeNews, markets));
    dual = parseDualFromJson(raw || "");
    mode = "claude-cli";
  }
  if (!dual) return null;

  const at = new Date().toISOString();
  const wrap = (audience: WdimAudience, briefing: WdimBriefing): WdimResult =>
    ({ range, audience, mode, briefing: attachUrls(briefing, urlMap), generatedAt: at });
  return { b2b: wrap("b2b", dual.b2b), b2c: wrap("b2c", dual.b2c) };
}

/**
 * Generate the full 6-config matrix (b2b/b2c × day/week/month) in one pass.
 * Three parallel per-range calls each produce BOTH audiences (so the two never
 * repeat each other), then a per-audience pass dedupes across day/week/month so a
 * story never repeats across timeframes either.
 */
export async function generateWdimMatrix(
  news: WdimNews[] = [],
  markets: WdimMarket[] = [],
): Promise<Record<WdimAudience, Record<WdimRange, WdimResult>> | null> {
  const [day, week, month] = await Promise.all([
    generateWdimRange("day", news, markets),
    generateWdimRange("week", news, markets),
    generateWdimRange("month", news, markets),
  ]);
  const ranges = { day, week, month } as Record<WdimRange, { b2b: WdimResult; b2c: WdimResult } | null>;
  if (!day && !week && !month) return null;

  const out = { b2b: {}, b2c: {} } as Record<WdimAudience, Record<WdimRange, WdimResult>>;
  for (const audience of ["b2b", "b2c"] as WdimAudience[]) {
    const seen = new Set<string>(); // cross-range dedup within this audience (day wins ties)
    for (const r of ["day", "week", "month"] as WdimRange[]) {
      const res = ranges[r]?.[audience];
      if (!res) continue;
      out[audience][r] = { ...res, briefing: dedupeBriefing(res.briefing, seen) };
    }
  }
  return out;
}

export function wdimReady(): boolean {
  try { return getSignals().length > 0; } catch { return false; }
}

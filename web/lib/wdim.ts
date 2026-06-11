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

const RANGE_DAYS: Record<WdimRange, number> = { day: 1, week: 7, month: 30 };
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

function gather(range: WdimRange): Signal[] {
  const days = RANGE_DAYS[range];
  const limit = range === "month" ? 40 : range === "week" ? 30 : 20;
  return recentForSynthesis(days, limit);
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
        description: "4-6 expert perspectives drawn from the EXPERT SIGNALS. Each thesis title must be copied verbatim from the signals so a URL can be attached. Cards link directly to the source Substack publication.",
        minItems: 2,
        maxItems: 6,
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
        description: "2-5 strategic context notes derived from the current developments. Factual observations, not prescriptive instructions. No em dashes.",
        minItems: 2,
        maxItems: 5,
        items: {
          type: "object",
          properties: {
            action: {
              type: "string",
              description: "A single strategic context note (1 sentence). Factual, not prescriptive. UK English.",
            },
          },
          required: ["action"],
        },
      },
    },
    required: ["macro_indicator", "developments", "expert_perspectives", "directives"],
  },
};

function buildSystemPrompt(range: WdimRange, audience: WdimAudience): string {
  const ctx = AUDIENCE_CONTEXT[audience];
  return [
    `You are a precise intelligence analyst for Jotter Intelligence, producing structured briefings for ${ctx.label}.`,
    `Your focus for this audience: ${ctx.focus}.`,
    `Timeframe context (${RANGE_LABEL[range]}): ${ctx.timeframes[range]}`,
    ``,
    `STRICT RULES:`,
    `- UK English exclusively: per cent, categorise, behaviour, prioritising, whilst, organisation.`,
    `- NEVER use em dashes (never output: —). Use colons, commas, or parentheses instead.`,
    `- No advice or prescription. Never write "you should", "watch for", "action required", or "we recommend".`,
    `- No meta-commentary or filler. Do not reference this briefing, the source list, or the analyst.`,
    `- macro_indicator must open with a concrete named development, data point, or actor. It describes the broader macro environment (geopolitical, technological, regulatory, societal or economic context), not only financial markets. Do not fabricate statistics or institutions.`,
    `- development headlines and expert_perspective thesis values must be copied verbatim from the source material provided.`,
    `- For developments, include no more than one item per source publication. If the same publication appears multiple times, pick the most relevant item only.`,
    `- Copy URLs verbatim from the source data where provided. Never fabricate or modify URLs.`,
    `- If source items lack a hard figure for the macro indicator, use the most concrete factual statement present.`,
  ].join("\n");
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
): string {
  const system = buildSystemPrompt(range, audience);
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
      .slice(0, 6)
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
): Promise<WdimResult | null> {
  const items = gather(range);
  const urlMap = buildUrlMap(items, news);

  // API with tool use preferred (eliminates parsing errors).
  const systemPrompt = buildSystemPrompt(range, audience);
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
  const cliPrompt = buildCliPrompt(range, audience, items, news, markets, custom);
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

export function wdimReady(): boolean {
  try { return getSignals().length > 0; } catch { return false; }
}

import { NextResponse } from "next/server";
import { generateWdim, generateWdimMatrix, wdimReady, type WdimRange, type WdimAudience, type WdimNews, type WdimMarket, type WdimResult } from "@/lib/wdim";
import { loadData } from "@/lib/data";

export const maxDuration = 120; // matrix = 3 parallel dual-audience calls (Sonnet)

const RANGES = ["day", "week", "month"] as const;
const AUDIENCES = ["b2b", "b2c"] as const;
const NEWS_CATEGORIES = ["world", "business", "ft", "technology", "uk"] as const;
const CAT_LABEL: Record<string, string> = {
  world: "World", business: "Business", ft: "Money", technology: "Tech", uk: "UK",
};

type CacheEntry = { at: number; data: unknown };
type Matrix = Record<WdimAudience, Record<WdimRange, WdimResult>>;
const g = globalThis as unknown as {
  __wdim?: Record<string, CacheEntry>;
  __wdimInflight?: Promise<Matrix | null>;
};
const TTL = 30 * 60 * 1000;

async function aggregate(origin: string): Promise<{ news: WdimNews[]; markets: WdimMarket[] }> {
  const news: WdimNews[] = [];
  await Promise.all(
    NEWS_CATEGORIES.map(async (cat) => {
      try {
        const r = await fetch(`${origin}/api/trending?category=${cat}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8000),
        });
        if (!r.ok) return;
        const j = await r.json();
        for (const t of (j?.topics ?? []).slice(0, 8) as { title: string; source: string; url?: string }[]) {
          news.push({ title: t.title, source: t.source, url: t.url, category: CAT_LABEL[cat] || cat });
        }
      } catch { /* skip */ }
    })
  );
  let markets: WdimMarket[] = [];
  try {
    const r = await fetch(`${origin}/api/markets`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const j = await r.json();
      const arr = (Array.isArray(j) ? j : j?.quotes ?? []) as { name: string; price: number; changePct: number }[];
      markets = arr
        .filter((m) => m && typeof m.price === "number")
        .map((m) => ({ name: m.name, price: m.price, changePct: m.changePct }));
    }
  } catch { /* skip */ }
  return { news, markets };
}

export async function GET(req: Request) {
  await loadData();
  if (!wdimReady()) {
    return NextResponse.json({ available: false });
  }

  const url = new URL(req.url);
  const rawRange = url.searchParams.get("range") ?? "day";
  const range = (RANGES as readonly string[]).includes(rawRange) ? (rawRange as WdimRange) : "day";

  const rawAud = url.searchParams.get("audience") ?? "b2b";
  const audience = (AUDIENCES as readonly string[]).includes(rawAud) ? (rawAud as WdimAudience) : "b2b";

  const custom = url.searchParams.get("custom") ?? undefined;
  const cacheKey = `${audience}-${range}`;
  const EDGE = "public, s-maxage=86400, stale-while-revalidate=86400";

  // Custom queries bypass the cache and the bundle: single fresh range, no store.
  if (custom) {
    const { news, markets } = await aggregate(url.origin);
    const result = await generateWdim(range, audience, news, markets, custom);
    if (!result) return NextResponse.json({ available: false });
    return NextResponse.json({ available: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  }

  g.__wdim ??= {};
  const cached = g.__wdim[cacheKey];
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json({ available: true, ...(cached.data as object) }, { headers: { "Cache-Control": EDGE } });
  }

  // Cache miss: generate the WHOLE matrix (b2b/b2c × day/week/month) in ONE pass so both
  // audiences are split from the same material (no repeats) and each timeframe is distinct.
  // A single in-flight lock means every near-simultaneous request shares one generation.
  if (!g.__wdimInflight) {
    g.__wdimInflight = (async () => {
      try {
        const { news, markets } = await aggregate(url.origin);
        const matrix = await generateWdimMatrix(news, markets);
        if (matrix) {
          const now = Date.now();
          for (const aud of AUDIENCES) {
            for (const r of RANGES) {
              if (matrix[aud]?.[r]) g.__wdim![`${aud}-${r}`] = { at: now, data: matrix[aud][r] };
            }
          }
        }
        return matrix;
      } finally {
        g.__wdimInflight = undefined;
      }
    })();
  }

  const matrix = await g.__wdimInflight;
  if (!matrix || !matrix[audience]?.[range]) {
    return NextResponse.json({ available: false });
  }
  return NextResponse.json({ available: true, ...matrix[audience][range] }, { headers: { "Cache-Control": EDGE } });
}

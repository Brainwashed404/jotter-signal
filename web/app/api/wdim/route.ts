import { NextResponse } from "next/server";
import { generateWdim, generateWdimBundle, bundleTitles, wdimReady, type WdimRange, type WdimAudience, type WdimNews, type WdimMarket, type WdimResult } from "@/lib/wdim";
import { loadData } from "@/lib/data";

export const maxDuration = 60; // bundle = 3 parallel Anthropic calls

const RANGES = ["day", "week", "month"] as const;
const AUDIENCES = ["b2b", "b2c"] as const;
const NEWS_CATEGORIES = ["world", "business", "ft", "technology", "uk"] as const;
const CAT_LABEL: Record<string, string> = {
  world: "World", business: "Business", ft: "Money", technology: "Tech", uk: "UK",
};

type CacheEntry = { at: number; data: unknown };
const g = globalThis as unknown as {
  __wdim?: Record<string, CacheEntry>;
  __wdimInflight?: Record<string, Promise<Record<WdimRange, WdimResult> | null>>;
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

  // Cache miss: generate the WHOLE audience bundle (day + week + month) in one pass
  // so the three timeframes are deduped against each other, then cache all three.
  // An in-flight lock per audience means the client's near-simultaneous day/week/month
  // requests share ONE generation instead of each kicking off its own bundle.
  g.__wdimInflight ??= {};
  if (!g.__wdimInflight[audience]) {
    g.__wdimInflight[audience] = (async () => {
      try {
        const { news, markets } = await aggregate(url.origin);
        // Exclude the other audience's titles (if already generated) so b2b/b2c diverge.
        const other: WdimAudience = audience === "b2b" ? "b2c" : "b2b";
        const otherBundle: Record<string, WdimResult> = {};
        for (const r of RANGES) {
          const c = g.__wdim![`${other}-${r}`];
          if (c) otherBundle[r] = c.data as WdimResult;
        }
        const bundle = await generateWdimBundle(audience, news, markets, bundleTitles(otherBundle));
        if (bundle) {
          const now = Date.now();
          for (const r of RANGES) {
            if (bundle[r]) g.__wdim![`${audience}-${r}`] = { at: now, data: bundle[r] };
          }
        }
        return bundle;
      } finally {
        delete g.__wdimInflight![audience];
      }
    })();
  }

  const bundle = await g.__wdimInflight[audience];
  if (!bundle || !bundle[range]) {
    return NextResponse.json({ available: false });
  }
  return NextResponse.json({ available: true, ...bundle[range] }, { headers: { "Cache-Control": EDGE } });
}

import { NextResponse } from "next/server";
import { generateWdim, wdimReady, type WdimRange, type WdimAudience, type WdimNews, type WdimMarket } from "@/lib/wdim";

// LOCAL-ONLY prototype. In production DATA_URL is set, so we return
// { available: false } and the home module renders nothing.
const RANGES = ["day", "week", "month"] as const;
const AUDIENCES = ["b2b", "b2c"] as const;
const NEWS_CATEGORIES = ["world", "business", "ft", "technology", "uk"] as const;
const CAT_LABEL: Record<string, string> = {
  world: "World", business: "Business", ft: "Money", technology: "Tech", uk: "UK",
};

type CacheEntry = { at: number; data: unknown };
const g = globalThis as unknown as { __wdim?: Record<string, CacheEntry> };
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

  // Cache is bypassed for custom queries so the prompt context is always fresh.
  if (!custom) {
    g.__wdim ??= {};
    const cached = g.__wdim[cacheKey];
    if (cached && Date.now() - cached.at < TTL) {
      return NextResponse.json({ available: true, ...(cached.data as object) });
    }
  }

  const { news, markets } = await aggregate(url.origin);
  const result = await generateWdim(range, audience, news, markets, custom || undefined);
  if (!result) {
    return NextResponse.json({ available: false });
  }

  if (!custom) {
    g.__wdim ??= {};
    g.__wdim[cacheKey] = { at: Date.now(), data: result };
  }

  return NextResponse.json({ available: true, ...result });
}

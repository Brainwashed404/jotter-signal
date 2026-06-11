import { NextResponse } from "next/server";
import { generateWdim, wdimReady, type WdimRange, type WdimNews, type WdimMarket } from "@/lib/wdim";

// LOCAL-ONLY prototype. In production DATA_URL is set, so we return
// { available: false } and the home module renders nothing.
const RANGES = ["day", "week", "month"] as const;
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
        const r = await fetch(`${origin}/api/trending?category=${cat}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
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
      markets = arr.filter((m) => m && typeof m.price === "number").map((m) => ({ name: m.name, price: m.price, changePct: m.changePct }));
    }
  } catch { /* skip */ }
  return { news, markets };
}

export async function GET(req: Request) {
  if (process.env.DATA_URL) {
    return NextResponse.json({ available: false });
  }
  if (!wdimReady()) {
    return NextResponse.json({ available: false });
  }
  const url = new URL(req.url);
  const raw = url.searchParams.get("range") ?? "day";
  const range = (RANGES as readonly string[]).includes(raw) ? (raw as WdimRange) : "day";

  g.__wdim ??= {};
  const cached = g.__wdim[range];
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json({ available: true, ...(cached.data as object) });
  }

  const { news, markets } = await aggregate(url.origin);
  const result = await generateWdim(range, news, markets);
  if (!result) {
    return NextResponse.json({ available: false });
  }
  g.__wdim[range] = { at: Date.now(), data: result };
  return NextResponse.json({ available: true, ...result });
}

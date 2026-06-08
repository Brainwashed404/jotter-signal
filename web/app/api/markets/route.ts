import { NextResponse } from "next/server";

// 10 key global indices. Live quotes via Yahoo Finance chart API (keyless).
const INDEXES: { symbol: string; name: string }[] = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^IXIC", name: "Nasdaq" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "^FTSE", name: "FTSE 100" },
  { symbol: "^GDAXI", name: "DAX" },
  { symbol: "^FCHI", name: "CAC 40" },
  { symbol: "^STOXX50E", name: "Euro Stoxx 50" },
  { symbol: "^N225", name: "Nikkei 225" },
  { symbol: "^HSI", name: "Hang Seng" },
  { symbol: "^AXJO", name: "ASX 200" },
];

type Quote = { name: string; symbol: string; price: number; changePct: number; up: boolean };
const g = globalThis as unknown as {
  __markets?: { at: number; data: Quote[] };
  __mkChart?: Record<string, { at: number; data: unknown }>;
};
const TTL = 60_000; // 1 min
const CHART_TTL = 5 * 60_000; // 5 min

async function fetchOne(symbol: string, name: string): Promise<Quote | null> {
  try {
    // range=1d so chartPreviousClose is the *previous session* close (the true daily
    // change). range=2d made it a 2-day reference, which gave wrong % swings.
    const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
    const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return null;
    const j = await r.json();
    const m = j?.chart?.result?.[0]?.meta;
    const price = m?.regularMarketPrice;
    const prev = m?.chartPreviousClose ?? m?.previousClose;
    if (typeof price !== "number" || typeof prev !== "number" || !prev) return null;
    const changePct = ((price - prev) / prev) * 100;
    return { name, symbol, price, changePct, up: changePct >= 0 };
  } catch { return null; }
}

// Yahoo range → interval pairing. Finer intervals = denser, smoother lines
// (intraday for short ranges; hourly for 1M so it isn't a chunky 22-point daily).
const RANGE_INTERVAL: Record<string, string> = {
  "1d": "2m", "5d": "15m", "1mo": "60m", "6mo": "1d", "1y": "1d", "5y": "1wk",
};

type Pt = { t: number; o: number; h: number; l: number; c: number; v: number };

async function fetchChart(symbol: string, range: string) {
  const interval = RANGE_INTERVAL[range] || "1d";
  const u = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, signal: AbortSignal.timeout(7000) });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  const res = j?.chart?.result?.[0];
  const ts: number[] = res?.timestamp || [];
  const q = res?.indicators?.quote?.[0] || {};
  const o: (number | null)[] = q.open || [], h: (number | null)[] = q.high || [],
        l: (number | null)[] = q.low || [], c: (number | null)[] = q.close || [],
        v: (number | null)[] = q.volume || [];
  const prevClose: number = res?.meta?.chartPreviousClose ?? c.find((x) => x != null) ?? 0;
  const points: Pt[] = ts
    .map((t, i) => ({ t: t * 1000, o: o[i], h: h[i], l: l[i], c: c[i], v: v[i] }))
    .filter((p) => p.c != null) as Pt[];
  return { symbol, range, points, prevClose, currency: res?.meta?.currency || "" };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const symbol = sp.get("symbol");
  const range = sp.get("range");

  // Chart mode: ?symbol=^GSPC&range=1mo → historical series for one index.
  if (symbol && range) {
    g.__mkChart ??= {};
    const key = `${symbol}:${range}`;
    const hit = g.__mkChart[key];
    if (hit && Date.now() - hit.at < CHART_TTL) return NextResponse.json(hit.data);
    try {
      const data = await fetchChart(symbol, range);
      g.__mkChart[key] = { at: Date.now(), data };
      return NextResponse.json(data);
    } catch (e) {
      return NextResponse.json({ error: String(e).slice(0, 120) }, { status: 502 });
    }
  }

  // Default: the ticker list of quotes.
  if (g.__markets && Date.now() - g.__markets.at < TTL) return NextResponse.json(g.__markets.data);
  const results = await Promise.all(INDEXES.map((i) => fetchOne(i.symbol, i.name)));
  const data = results.filter((q): q is Quote => q !== null);
  if (data.length) g.__markets = { at: Date.now(), data };
  return NextResponse.json(data);
}

// Runs on Vercel's Edge Network (Cloudflare IPs) rather than AWS Lambda.
// Reddit and Redlib block AWS datacenter IPs, but Cloudflare edge IPs are
// widely distributed and not subject to the same blanket blocks.
export const runtime = "edge";

import { NextResponse } from "next/server";

type NewsItem = { title: string; url: string; source: string; term: string; date: string };

const GEAR_RE = new RegExp(
  [
    "\\breview\\b", "\\bhands.on\\b", "buying guide", "\\bunboxing\\b",
    "\\bdeals?\\b", "\\bdiscount", "\\bcoupon", "\\d+%\\s*off",
    "\\bbest\\b[^.!?]{0,45}\\b(to buy|under \\$|for your|picks?|right now)\\b",
    "\\b(elevate|upgrade|transform|level up)\\s+your\\b",
  ].join("|"),
  "i"
);

function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

function termOf(title: string): string {
  const STOP = new Set(["The","A","An","How","Why","What","When","Who","Where","New","This","That",
    "Live","Watch","Could","Will","Has","Have","Is","Are","To","In","On","Of","For","And","But",
    "After","Before","Says","My","Your","It","We","They","Best","First","Here","These","Now"]);
  const ent = title.match(/\b[A-Z][a-zA-Z0-9.&''-]+(?:\s+[A-Z][a-zA-Z0-9.&''-]+){0,3}\b/g) || [];
  for (const e of ent) {
    const words = e.split(/\s+/).filter((w) => !STOP.has(w));
    const phrase = words.join(" ").replace(/['']s$/i, "").trim();
    if (phrase.length > 3) return phrase;
  }
  return title.split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)).slice(0, 3).join(" ");
}

// Try Reddit's own JSON API first (edge IPs are Cloudflare, not AWS — different block list).
async function tryRedditDirect(subreddit: string, sort: string, source: string): Promise<NewsItem[]> {
  const res = await fetch(`https://www.reddit.com/r/${subreddit}/${sort}.json?limit=25`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; jotter-intelligence/1.0)",
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(7000),
  });
  if (!res.ok) throw new Error(`Reddit direct: ${res.status}`);
  const json = await res.json() as { data?: { children?: { data: { title: string; url: string; permalink: string; is_self: boolean } }[] } };
  const posts = json?.data?.children ?? [];
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  for (const { data: p } of posts) {
    const title = decode(p.title);
    if (title.length < 12 || GEAR_RE.test(title)) continue;
    const url = p.is_self ? `https://www.reddit.com${p.permalink}` : p.url;
    const key = title.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url, source, term: termOf(title), date: "" });
    if (out.length >= 10) break;
  }
  if (!out.length) throw new Error("Reddit direct: 0 items");
  return out;
}

// Fallback: Redlib instances (open-source Reddit front-end, serves standard RSS).
const REDLIB_HOSTS = ["https://redlib.perennialte.ch", "https://redlib.r4fo.com"];
async function tryRedlib(subreddit: string, sort: string, source: string): Promise<NewsItem[]> {
  for (const host of REDLIB_HOSTS) {
    try {
      const res = await fetch(`${host}/r/${subreddit}.rss?sort=${sort}`, {
        headers: { "User-Agent": "Mozilla/5.0 jotter-intelligence/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const xml = await res.text();
      const blocks = xml.split(/<item[\s>]/i).slice(1);
      const out: NewsItem[] = [];
      for (const b of blocks) {
        const tm = b.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        if (!tm) continue;
        const title = decode(tm[1]);
        if (title.length < 12 || GEAR_RE.test(title)) continue;
        const linkText = b.match(/<link>([\s\S]*?)<\/link>/i);
        const linkHref = b.match(/<link[^>]*href="([^"]+)"/i);
        const url = (linkText?.[1]?.trim()) || (linkHref?.[1]) || "";
        if (!url) continue;
        out.push({ title, url, source, term: termOf(title), date: "" });
        if (out.length >= 10) break;
      }
      if (out.length) return out;
    } catch { /* try next */ }
  }
  return [];
}

const TTL = 5 * 60 * 1000;
const g = globalThis as unknown as { __redditCache?: { at: number; data: NewsItem[] } };

export async function GET() {
  if (g.__redditCache && Date.now() - g.__redditCache.at < TTL) {
    return NextResponse.json({ topics: g.__redditCache.data });
  }

  let data: NewsItem[] = [];
  try {
    data = await tryRedditDirect("news", "rising", "Reddit");
  } catch {
    data = await tryRedlib("news", "rising", "Reddit");
  }

  if (data.length) g.__redditCache = { at: Date.now(), data };
  return NextResponse.json({ topics: data });
}

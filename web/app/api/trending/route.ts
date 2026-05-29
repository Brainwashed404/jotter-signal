import { NextResponse } from "next/server";

// Current tech / media / culture headlines — the actual stories in the news now.
const FEEDS: { url: string; source: string }[] = [
  { url: "https://techcrunch.com/feed/", source: "TechCrunch" },
  { url: "https://www.theguardian.com/technology/rss", source: "Guardian" },
  { url: "https://www.wired.com/feed/rss", source: "WIRED" },
  { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", source: "BBC" },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml", source: "NYT" },
];

const STOP = new Set([
  "The", "A", "An", "How", "Why", "What", "When", "Who", "Where", "New", "This", "That",
  "Live", "Watch", "Could", "Will", "Has", "Have", "Is", "Are", "To", "In", "On", "Of",
  "For", "And", "But", "After", "Before", "Says", "My", "Your", "It", "We", "They", "Best",
  "First", "Here", "These", "Now", "More", "Most", "Inside", "Meet", "Can", "Review",
  "Tech", "Asked", "So", "Hands-On", "With", "Best", "Gave",
]);

type NewsItem = { title: string; url: string; source: string; term: string; date: string };
type Cache = { at: number; data: NewsItem[] };
const g = globalThis as unknown as { __news?: Cache };
const TTL = 30 * 60 * 1000;

function decode(s: string) {
  return s.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&#8217;|&#x2019;/g, "’").replace(/&[a-z]+;/g, " ").trim();
}

// salient search phrase from a headline: first proper-noun phrase, else key words
function termOf(title: string): string {
  const strip = (s: string) => s.replace(/[’']s$/i, "").trim();
  const ent = title.match(/\b[A-Z][a-zA-Z0-9.&'’-]+(?:\s+[A-Z][a-zA-Z0-9.&'’-]+){0,3}\b/g) || [];
  for (const e of ent) {
    const words = e.split(/\s+/).filter((w) => !STOP.has(w));
    const phrase = strip(words.join(" "));
    if (phrase.length > 3) return phrase;
  }
  return strip(title.split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w)).slice(0, 3).join(" "));
}

function parse(xml: string, source: string): NewsItem[] {
  const blocks = xml.split(/<(?:item|entry)[\s>]/i).slice(1);
  const out: NewsItem[] = [];
  for (const b of blocks) {
    const tm = b.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!tm) continue;
    const title = decode(tm[1]);
    if (title.length < 12) continue;
    // link: RSS <link>url</link> or Atom <link href="url"/>
    let url = "";
    const linkText = b.match(/<link>([\s\S]*?)<\/link>/i);
    const linkHref = b.match(/<link[^>]*href="([^"]+)"/i);
    url = (linkText && linkText[1].trim()) || (linkHref && linkHref[1]) || "";
    const dm = b.match(/<(?:pubDate|published|updated|dc:date)>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i);
    const date = dm ? dm[1].trim() : "";
    out.push({ title, url, source, term: termOf(title), date });
  }
  return out;
}

export async function GET() {
  if (g.__news && Date.now() - g.__news.at < TTL) {
    return NextResponse.json({ topics: g.__news.data });
  }
  const all: NewsItem[] = [];
  await Promise.all(
    FEEDS.map(async (f) => {
      try {
        const res = await fetch(f.url, { headers: { "User-Agent": "jotter-intelligence/1.0" }, signal: AbortSignal.timeout(8000) });
        const xml = await res.text();
        all.push(...parse(xml, f.source).slice(0, 6)); // a few most-recent per source
      } catch {
        /* skip */
      }
    })
  );
  // newest first, dedupe near-identical headlines, interleave sources
  all.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const seen = new Set<string>();
  const seenSrc = new Map<string, number>();
  const data: NewsItem[] = [];
  for (const it of all) {
    const key = it.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    const sc = seenSrc.get(it.source) ?? 0;
    if (sc >= 3) continue; // max 3 per source for variety
    seenSrc.set(it.source, sc + 1);
    data.push(it);
    if (data.length >= 9) break;
  }
  g.__news = { at: Date.now(), data };
  return NextResponse.json({ topics: data });
}

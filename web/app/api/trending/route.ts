import { NextResponse } from "next/server";

// Neutral-ish news feeds; trending = topics recurring across several of them.
const FEEDS = [
  "https://feeds.bbci.co.uk/news/technology/rss.xml",
  "https://feeds.bbci.co.uk/news/world/rss.xml",
  "https://www.theguardian.com/technology/rss",
  "https://www.theguardian.com/world/rss",
];

const STOP = new Set([
  "The", "A", "An", "How", "Why", "What", "When", "Who", "Where", "New", "This", "That",
  "Live", "Watch", "Video", "Opinion", "Analysis", "Could", "Will", "Has", "Have", "Is",
  "Are", "Be", "To", "In", "On", "Of", "For", "And", "But", "After", "Before", "Says",
  "Mr", "Ms", "Mrs", "Dr", "My", "Your", "It", "We", "I", "They", "Best", "First",
]);

type Cache = { at: number; data: { term: string; n: number }[] };
const g = globalThis as unknown as { __trending?: Cache };
const TTL = 30 * 60 * 1000;

const NOISE = new Set(["tech life", "tech now", "tech decoded", "newscast", "call", "duty", "the papers"]);

function titles(xml: string): string[] {
  const items = xml.split(/<item[\s>]/i).slice(1);
  const out: string[] = [];
  for (const it of items) {
    const m = it.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/);
    if (m) out.push(m[1].replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim());
  }
  return out;
}

// pull capitalised multi-word phrases (proper nouns) as candidate topics
function entities(title: string): string[] {
  const found = title.match(/\b([A-Z][a-zA-Z0-9.&'’-]+(?:\s+[A-Z][a-zA-Z0-9.&'’-]+){0,3})\b/g) || [];
  const out: string[] = [];
  for (let p of found) {
    // trim leading stopword (e.g. "The Gaza")
    const words = p.split(/\s+/).filter((w) => !STOP.has(w));
    if (!words.length) continue;
    p = words.join(" ");
    if (p.length < 3) continue;
    if (words.length === 1 && p.length < 4 && p !== "AI" && p !== "EU" && p !== "US" && p !== "UK") continue;
    out.push(p);
  }
  return out;
}

export async function GET() {
  if (g.__trending && Date.now() - g.__trending.at < TTL) {
    return NextResponse.json({ topics: g.__trending.data });
  }
  const counts = new Map<string, { n: number; label: string }>();
  await Promise.all(
    FEEDS.map(async (url) => {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "jotter-intelligence/1.0" }, signal: AbortSignal.timeout(8000) });
        const xml = await res.text();
        for (const t of titles(xml)) {
          for (const e of entities(t)) {
            const key = e.toLowerCase();
            const cur = counts.get(key) || { n: 0, label: e };
            cur.n += 1;
            counts.set(key, cur);
          }
        }
      } catch {
        /* skip feed on error */
      }
    })
  );
  const data = [...counts.values()]
    .filter((c) => c.n >= 2 && !NOISE.has(c.label.toLowerCase())) // trending across headlines, minus feed cruft
    .sort((a, b) => b.n - a.n)
    .slice(0, 12)
    .map((c) => ({ term: c.label, n: c.n }));
  g.__trending = { at: Date.now(), data };
  return NextResponse.json({ topics: data });
}

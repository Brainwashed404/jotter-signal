import { NextResponse } from "next/server";
import { getSignals } from "@/lib/data";

// Domain-relevant news feeds (tech / media / culture) — not general world news.
const FEEDS = [
  "https://feeds.bbci.co.uk/news/technology/rss.xml",
  "https://www.theguardian.com/technology/rss",
  "https://www.theguardian.com/media/rss",
  "https://www.wired.com/feed/rss",
  "https://techcrunch.com/feed/",
  "https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml",
  "https://www.theverge.com/rss/index.xml",
];

const STOP = new Set([
  // headline glue
  "The", "A", "An", "How", "Why", "What", "When", "Who", "Where", "New", "This", "That",
  "Live", "Watch", "Video", "Opinion", "Analysis", "Could", "Will", "Has", "Have", "Is",
  "Are", "Be", "To", "In", "On", "Of", "For", "And", "But", "After", "Before", "Says",
  "Mr", "Ms", "Mrs", "Dr", "My", "Your", "It", "We", "They", "Best", "First", "Review",
  "Here", "These", "Now", "More", "Most", "One", "Two", "Three", "Inside", "Meet", "Can",
  // months
  "January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday",
  // generic tech / news nouns
  "Tech", "Technology", "Future", "Internet", "Online", "Digital", "Data", "App", "Apps",
  "Web", "Software", "Hardware", "Update", "Guide", "News", "Report", "Story", "Week", "Day",
  "Year", "Today", "World", "People", "Company", "Companies", "Startup", "Startups",
  "Driving", "Call", "Duty", "Game", "Games", "Show", "Series", "Season", "Deal", "Deals",
  "Sale", "Top", "Tips", "Things", "Way", "Ways", "Time", "Times", "Life", "Work",
  // publications
  "Guardian", "BBC", "Wired", "Verge", "NYT", "Post", "Reuters", "CNN", "TechCrunch", "Observer",
]);
const NOISE = new Set(["tech life", "tech now", "newscast", "the papers", "us", "uk"]);

type Cache = { at: number; data: { term: string; n: number }[] };
const g = globalThis as unknown as { __trending?: Cache; __headblob?: string };
const TTL = 30 * 60 * 1000;

function titles(xml: string): string[] {
  // works for RSS <item> and Atom <entry>; drop the first <title> (publication name)
  const all = [...xml.matchAll(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/g)].map((m) =>
    m[1].replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim()
  );
  return all.slice(1);
}

function entities(title: string): string[] {
  const found = title.match(/\b([A-Z][a-zA-Z0-9.&'’-]+(?:\s+[A-Z][a-zA-Z0-9.&'’-]+){0,3})\b/g) || [];
  const out: string[] = [];
  for (let p of found) {
    const words = p.split(/\s+/).filter((w) => !STOP.has(w));
    if (!words.length) continue;
    p = words.join(" ");
    if (p.length < 3) continue;
    if (words.length === 1 && p.length < 4 && !["AI", "EU"].includes(p)) continue;
    out.push(p);
  }
  return out;
}

function headBlob(): string {
  if (!g.__headblob) {
    g.__headblob = getSignals().map((s) => s.heading).join(" \n ").toLowerCase();
  }
  return g.__headblob;
}

export async function GET() {
  if (g.__trending && Date.now() - g.__trending.at < TTL) {
    return NextResponse.json({ topics: g.__trending.data });
  }

  // term -> {feeds it appears in, total mentions, label}
  const cand = new Map<string, { feeds: Set<number>; n: number; label: string }>();
  await Promise.all(
    FEEDS.map(async (url, fi) => {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "jotter-intelligence/1.0" }, signal: AbortSignal.timeout(8000) });
        const xml = await res.text();
        for (const t of titles(xml))
          for (const e of entities(t)) {
            const key = e.toLowerCase();
            if (NOISE.has(key)) continue;
            const c = cand.get(key) || { feeds: new Set<number>(), n: 0, label: e };
            c.feeds.add(fi); c.n += 1; cand.set(key, c);
          }
      } catch {
        /* skip dead feed */
      }
    })
  );

  const blob = headBlob();
  const scored = [...cand.entries()].map(([key, c]) => {
    const covered = blob.includes(key); // does any expert headline mention it?
    return { term: c.label, feeds: c.feeds.size, n: c.n, covered };
  });

  // genuine trending only = recurring across >=2 sources; archive-covered first
  const data = scored
    .filter((s) => s.feeds >= 2)
    .sort((a, b) => Number(b.covered) - Number(a.covered) || b.feeds - a.feeds || b.n - a.n)
    .slice(0, 12)
    .map((s) => ({ term: s.term, n: s.n }));

  g.__trending = { at: Date.now(), data };
  return NextResponse.json({ topics: data });
}

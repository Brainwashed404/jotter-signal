// Reddit blocks unauthenticated requests from all cloud/datacenter IPs.
// The ONLY server-side fix is Reddit's official OAuth2 API — authenticated
// requests are allowed from any IP. Requires two free env vars:
//   REDDIT_CLIENT_ID     (shown under the app name at reddit.com/prefs/apps)
//   REDDIT_CLIENT_SECRET (the secret for that app)
//
// If the env vars are absent the endpoint returns empty (tab stays hidden).
// Set up: reddit.com/prefs/apps → "create another app…" → type = "script",
// redirect uri = http://localhost:8080 (unused) → note the client_id & secret.

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

// --- Reddit OAuth2 client-credentials flow -----------------------------------
// Tokens last 1 hour; we cache and reuse until 5 min before expiry.
const g = globalThis as unknown as {
  __redditToken?: { value: string; expiry: number };
  __redditCache?: { at: number; data: NewsItem[] };
};
const TTL = 5 * 60 * 1000;

async function getToken(): Promise<string | null> {
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  if (!id || !secret) return null;

  // Reuse cached token if still valid (expire 5 min early for safety)
  if (g.__redditToken && Date.now() < g.__redditToken.expiry) return g.__redditToken.value;

  const creds = Buffer.from(`${id}:${secret}`).toString("base64");
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "jotter-intelligence/1.0 (https://jotter.media)",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) { console.error("[reddit] token fetch failed:", res.status); return null; }
  const data = await res.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  g.__redditToken = { value: data.access_token, expiry: Date.now() + ((data.expires_in ?? 3600) - 300) * 1000 };
  return g.__redditToken.value;
}

async function fetchRedditOAuth(subreddit: string, sort: string): Promise<NewsItem[]> {
  const token = await getToken();
  if (!token) return [];

  const res = await fetch(`https://oauth.reddit.com/r/${subreddit}/${sort}.json?limit=25&raw_json=1`, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "User-Agent": "jotter-intelligence/1.0 (https://jotter.media)",
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) { console.error("[reddit] API fetch failed:", res.status); return []; }

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
    out.push({ title, url, source: "Reddit", term: termOf(title), date: "" });
    if (out.length >= 10) break;
  }
  return out;
}

export async function GET() {
  if (g.__redditCache && Date.now() - g.__redditCache.at < TTL) {
    return NextResponse.json({ topics: g.__redditCache.data });
  }

  const data = await fetchRedditOAuth("news", "rising");
  if (data.length) g.__redditCache = { at: Date.now(), data };
  return NextResponse.json({ topics: data });
}

import { NextResponse } from "next/server";

// Current headlines by category. FREE-TO-READ sources only — no point linking to
// anything behind a paywall. (Excluded: WIRED, NYT, MIT Tech Review, Economist, 404 Media.)
type Feed = { url: string; source: string; match?: string }; // match = only keep items whose URL contains this
const CATEGORIES: Record<string, Feed[]> = {
  uk: [
    { url: "https://www.theguardian.com/uk-news/rss", source: "Guardian" },
    { url: "https://feeds.bbci.co.uk/news/uk/rss.xml", source: "BBC" },
    { url: "https://feeds.skynews.com/feeds/rss/uk.xml", source: "Sky News" },
    { url: "https://www.independent.co.uk/news/uk/rss", source: "Independent" },
    { url: "https://inews.co.uk/news/feed", source: "i" },
    { url: "https://theconversation.com/uk/articles.atom", source: "The Conversation" },
  ],
  world: [
    { url: "https://www.theguardian.com/world/rss", source: "Guardian" },
    { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC" },
    { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera" },
    { url: "https://feeds.skynews.com/feeds/rss/world.xml", source: "Sky News" },
    { url: "https://www.independent.co.uk/news/world/rss", source: "Independent" },
    { url: "https://rss.dw.com/rdf/rss-en-all", source: "DW" },
    { url: "https://www.euronews.com/rss", source: "Euronews" },
    { url: "https://feeds.npr.org/1004/rss.xml", source: "NPR" },
    { url: "https://www.cbc.ca/webfeed/rss/rss-world", source: "CBC" },
  ],
  business: [
    { url: "https://www.theguardian.com/business/rss", source: "Guardian" },
    { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC" },
    { url: "https://feeds.skynews.com/feeds/rss/business.xml", source: "Sky News" },
    { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC" },
    { url: "https://www.cityam.com/feed/", source: "City AM" },
    { url: "https://feeds.npr.org/1006/rss.xml", source: "NPR" },
  ],
  politics: [
    { url: "https://www.theguardian.com/politics/rss", source: "Guardian" },
    { url: "https://feeds.bbci.co.uk/news/politics/rss.xml", source: "BBC" },
    { url: "https://feeds.skynews.com/feeds/rss/politics.xml", source: "Sky News" },
    { url: "https://www.independent.co.uk/news/uk/politics/rss", source: "Independent" },
    { url: "https://www.politico.eu/feed/", source: "Politico" },
    { url: "https://inews.co.uk/news/politics/feed", source: "i" },
  ],
  ft: [
    { url: "https://www.ft.com/rss/home/international", source: "FT" },
    { url: "https://feeds.marketwatch.com/marketwatch/topstories/", source: "MarketWatch" },
  ],
  timeout: [
    { url: "https://www.timeout.com/london/feed.rss", source: "Time Out", match: "/news/" },
  ],
  reddit: [],     // handled by fetchReddit in CUSTOM (via Redlib)
  futurology: [], // handled by fetchReddit in CUSTOM (via Redlib)
  technology: [
    { url: "https://techcrunch.com/feed/", source: "TechCrunch" },
    { url: "https://www.theguardian.com/technology/rss", source: "Guardian" },
    { url: "https://feeds.bbci.co.uk/news/technology/rss.xml", source: "BBC" },
    { url: "https://feeds.arstechnica.com/arstechnica/index", source: "Ars Technica" },
    { url: "https://www.theverge.com/rss/index.xml", source: "The Verge" },
    { url: "https://www.theregister.com/headlines.atom", source: "The Register" },
    { url: "https://thenextweb.com/feed", source: "The Next Web" },
    { url: "https://restofworld.org/feed/latest/", source: "Rest of World" },
    { url: "https://www.vice.com/en/topic/tech/rss", source: "Vice" },
    { url: "https://www.vox.com/rss/future-perfect/index.xml", source: "Vox Future Perfect" },
  ],
};
export const CATEGORY_ORDER = ["uk", "world", "business", "politics", "technology", "futurology", "guardian", "ft", "reuters", "bbc", "timeout", "reddit", "wikipedia", "github", "google"];

// GitHub trending repos (monthly, English) — scraped from the trending page (no API);
// repo name + tagline + this-month star gain, ordered by that star volume.
async function fetchGithubTrending(): Promise<NewsItem[]> {
  try {
    const res = await fetch("https://github.com/trending?since=monthly&spoken_language_code=en", {
      headers: { "User-Agent": "Mozilla/5.0 jotter-intelligence/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const rows: (NewsItem & { _stars: number })[] = [];
    const seen = new Set<string>();
    for (const b of html.split('<article class="Box-row">').slice(1)) {
      const hm = b.match(/<h2[^>]*>\s*<a[^>]*href="\/([^"]+?)\/?"/i);
      if (!hm) continue;
      const slug = hm[1];                       // owner/repo
      if (!slug.includes("/") || seen.has(slug)) continue;
      seen.add(slug);
      const dm = b.match(/<p[^>]*color-fg-muted[^>]*>([\s\S]*?)<\/p>/i);
      const desc = dm ? decode(dm[1]) : "";
      const sm = b.match(/([\d,]+)\s*stars\s*this month/i);
      const stars = sm ? parseInt(sm[1].replace(/,/g, ""), 10) : 0;
      const starCtx = stars ? `★ ${stars.toLocaleString()} this month` : "";
      rows.push({
        title: slug.replace("/", " / "),
        url: `https://github.com/${slug}`,
        source: "GitHub",
        term: slug.split("/")[1] || slug,
        date: "",
        context: [starCtx, desc].filter(Boolean).join(" · ").slice(0, 160),
        _stars: stars,
      });
    }
    return rows.sort((a, b) => b._stars - a._stars).slice(0, 10).map(({ _stars, ...r }) => r);
  } catch {
    return [];
  }
}

// Google Trends "trending searches" (GB) via the daily-trends RSS; term + search volume,
// linked to the top related news story.
async function fetchGoogleTrends(): Promise<NewsItem[]> {
  try {
    const res = await fetch("https://trends.google.com/trending/rss?geo=GB", {
      headers: { "User-Agent": "Mozilla/5.0 jotter-intelligence/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const trafficNum = (s: string) => {
      const m = s.replace(/,/g, "").match(/([\d.]+)\s*([KM]?)/i);
      if (!m) return 0;
      return parseFloat(m[1]) * (m[2].toUpperCase() === "M" ? 1e6 : m[2].toUpperCase() === "K" ? 1e3 : 1);
    };
    const out: (NewsItem & { _vol: number })[] = [];
    for (const b of xml.split(/<item>/i).slice(1)) {
      const tm = b.match(/<title>([\s\S]*?)<\/title>/i);
      const term = tm ? decode(tm[1]) : "";
      if (!term) continue;
      const traffic = (b.match(/<ht:approx_traffic>([\s\S]*?)<\/ht:approx_traffic>/i)?.[1] || "").trim();
      // a trend can carry several related news items; prefer a UK/English source so the
      // context isn't in a foreign language (geo=GB sometimes surfaces e.g. a Polish outlet first).
      const news = [...b.matchAll(/<ht:news_item>([\s\S]*?)<\/ht:news_item>/gi)]
        .map((m) => ({
          u: (m[1].match(/<ht:news_item_url>([\s\S]*?)<\/ht:news_item_url>/i)?.[1] || "").trim(),
          t: decode(m[1].match(/<ht:news_item_title>([\s\S]*?)<\/ht:news_item_title>/i)?.[1] || ""),
        }))
        .filter((n) => n.u);
      const FOREIGN = /\.(pl|de|fr|es|it|nl|se|no|fi|dk|pt|gr|cz|sk|hu|ro|ru|ua|tr|br|mx|jp|cn|kr|in|id|th|vn|ar)(\/|$|:)/i;
      const pick = news.find((n) => /\.uk(\/|$|:)/i.test(n.u)) || news.find((n) => !FOREIGN.test(n.u)) || news[0];
      const newsUrl = pick?.u || "";
      const newsTitle = pick?.t || "";
      const title = term.split(" ").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
      // context (like the Wikipedia pill): what's behind the trend = its top news headline, plus search volume
      const bits = [traffic && `${traffic} searches`, newsTitle].filter(Boolean);
      let context = bits.join(" · ");
      if (context.length > 150) context = context.slice(0, 147) + "…";
      out.push({
        title,
        url: newsUrl || `https://trends.google.com/trending?geo=GB`,
        source: "Google Trends",
        term,
        date: "",
        context,
        _vol: trafficNum(traffic),
      });
    }
    // order by search volume, highest first, then take the top 10
    return out.sort((a, b) => b._vol - a._vol).slice(0, 10).map(({ _vol, ...n }) => n);
  } catch {
    return [];
  }
}
// Reddit blocks requests from datacentre IPs (so a direct fetch works locally but
// 403s on Vercel). Route through Redlib — an open-source Reddit front-end whose own
// servers fetch Reddit and expose a standard RSS feed. Try instances in order so the
// tab survives one going down.
const REDLIB_HOSTS = ["https://redlib.perennialte.ch", "https://redlib.r4fo.com"];
async function fetchReddit(subreddit: string, sort: string, source: string): Promise<NewsItem[]> {
  for (const host of REDLIB_HOSTS) {
    try {
      const res = await fetch(`${host}/r/${subreddit}.rss?sort=${sort}`, {
        headers: { "User-Agent": "Mozilla/5.0 jotter-intelligence/1.0" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const items = parse(await res.text(), source);
      if (items.length) return items.slice(0, 10);
    } catch {
      /* try the next instance */
    }
  }
  return [];
}

// Reuters "Top Stories": reuters.com blocks scraping (401), so pull recent Reuters
// articles via Google News RSS and strip the trailing " - Reuters" source tag.
async function fetchReuters(): Promise<NewsItem[]> {
  try {
    const res = await fetch(
      "https://news.google.com/rss/search?q=site:reuters.com+when:1d&hl=en-GB&gl=GB&ceid=GB:en",
      { headers: { "User-Agent": "Mozilla/5.0 jotter-intelligence/1.0" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const xml = await res.text();
    const out: NewsItem[] = [];
    const seen = new Set<string>();
    for (const b of xml.split(/<item>/i).slice(1)) {
      const tm = b.match(/<title>([\s\S]*?)<\/title>/i);
      if (!tm) continue;
      const title = decode(tm[1]).replace(/\s*[-–]\s*[^-–]+$/, "").trim(); // drop " - Reuters"
      if (title.length < 12 || GEAR_RE.test(title)) continue;
      const url = (b.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || "").trim();
      const key = title.toLowerCase().slice(0, 40);
      if (!url || seen.has(key)) continue;
      seen.add(key);
      out.push({ title, url, source: "Reuters", term: termOf(title), date: "" });
      if (out.length >= 10) break;
    }
    return out;
  } catch {
    return [];
  }
}

// BBC "Most read": scrape the `data-component="mostRead"` ranked list on the News front page.
async function fetchBbcMostRead(): Promise<NewsItem[]> {
  try {
    const res = await fetch("https://www.bbc.co.uk/news", {
      headers: { "User-Agent": "Mozilla/5.0 jotter-intelligence/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    const block = html.match(/data-component="mostRead"([\s\S]*?)<\/ol>/i);
    if (!block) return [];
    const out: NewsItem[] = [];
    const seen = new Set<string>();
    const re = /<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(block[1]))) {
      let href = m[1];
      const title = decode(m[2]);
      if (title.length < 8) continue;
      if (href.startsWith("/")) href = "https://www.bbc.co.uk" + href;
      if (seen.has(href)) continue;
      seen.add(href);
      out.push({ title, url: href, source: "BBC", term: termOf(title), date: "" });
      if (out.length >= 10) break;
    }
    return out;
  } catch {
    return [];
  }
}

const DEFAULT_CATEGORY = "technology";

// Guardian "most read across the Guardian": the lightweight JSON the site's own
// most-popular component uses (an `html` blob of the top-10 ordered list).
async function fetchGuardianMostRead(): Promise<NewsItem[]> {
  try {
    const res = await fetch("https://api.nextgen.guardianapps.co.uk/most-read.json", {
      headers: { "User-Agent": "jotter-intelligence/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html: string = (await res.json())?.html ?? "";
    const out: NewsItem[] = [];
    const seen = new Set<string>();
    // pair each article anchor with its headline text
    const re = /<a\b[^>]*href="(https:\/\/www\.theguardian\.com\/[^"]+)"[\s\S]*?js-headline-text[^>]*>([^<]+)</g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const url = m[1].replace(/[?#].*$/, "");
      const title = decode(m[2]);
      if (title.length < 8 || seen.has(url)) continue;
      seen.add(url);
      out.push({ title, url, source: "Guardian", term: termOf(title), date: "" });
      if (out.length >= 10) break;
    }
    return out;
  } catch {
    return [];
  }
}

// Wikipedia "most read today": the same data the topviews tool uses, via the Wikimedia
// REST pageviews API. Walk back from yesterday to the latest day that has data (the feed
// lags ~1 day), and drop non-article namespaces / the Main Page / placeholders.
const WIKI_SKIP = /^(Main_Page|Special:|Wikipedia:|Portal:|Help:|Category:|File:|Talk:|User:|Template:|Draft:|MediaWiki:|Module:)|^-$/i;
async function fetchWikipediaTop(): Promise<NewsItem[]> {
  const now = new Date();
  for (let back = 1; back <= 6; back++) {
    const d = new Date(now.getTime() - back * 86400000);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/top/en.wikipedia.org/all-access/${y}/${m}/${day}`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "jotter-intelligence/1.0 (https://jotter.media)" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const articles: { article?: string }[] = json?.items?.[0]?.articles ?? [];
      const out: NewsItem[] = [];
      for (const a of articles) {
        const name = a.article ?? "";
        if (!name || WIKI_SKIP.test(name)) continue;
        const title = name.replace(/_/g, " ").replace(/\s*\([^)]*\)\s*$/, ""); // drop disambiguation suffix
        out.push({
          title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(name)}`,
          source: "Wikipedia",
          term: title,
          date: `${y}-${m}-${day}`,
        });
        if (out.length >= 10) break;
      }
      if (out.length) {
        // attach a short context line per article (Wikidata description, else first sentence)
        await Promise.all(out.map(async (it) => { it.context = await wikiContext(it.url); }));
        return out;
      }
    } catch {
      /* try an earlier day */
    }
  }
  return [];
}

// One-line context for a Wikipedia article via the REST summary endpoint:
// prefer the short Wikidata description, fall back to the first sentence of the extract.
async function wikiContext(articleUrl: string): Promise<string> {
  const name = articleUrl.split("/wiki/")[1];
  if (!name) return "";
  try {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${name}`, {
      headers: { "User-Agent": "jotter-intelligence/1.0 (https://jotter.media)" },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return "";
    const j: { description?: string; extract?: string; type?: string } = await res.json();
    const desc = (j.description || "").trim();
    if (desc && j.type !== "disambiguation" && !/disambiguation/i.test(desc)) {
      return desc.charAt(0).toUpperCase() + desc.slice(1);
    }
    let ex = (j.extract || "").replace(/\s+/g, " ").trim();
    const dot = ex.indexOf(". ");
    if (dot > 30) ex = ex.slice(0, dot + 1);
    return ex.length > 160 ? ex.slice(0, 157).trimEnd() + "…" : ex;
  } catch {
    return "";
  }
}

// Skip reviews, buying guides, gear, deals and affiliate/lifestyle product content.
const GEAR_RE = new RegExp(
  [
    "\\breview\\b", "\\bhands.on\\b", "buying guide", "\\bunboxing\\b", "\\bspecs?\\b",
    "\\bdeals?\\b", "\\bdiscount", "\\bcoupon", "\\d+%\\s*off", "\\bgadget",
    "\\bbest\\b[^.!?]{0,45}\\b(to buy|under \\$|for your|picks?|right now)\\b",
    "\\b(elevate|upgrade|transform|level up)\\s+your\\b",
    "\\byour\\s+(summer|home|kitchen|desk|setup|wardrobe|gaming|workout|pizza|sleep|coffee|garden|wallet|next)\\b",
    // a small consumer price tag in the headline ($300, $1,299) but NOT big-money news ($4B, $2 trillion)
    "\\$\\d[\\d,]*\\b(?!\\.?\\d*\\s*(?:billion|million|trillion|bn|tn|[bmk]\\b))",
    // aggressive: any consumer-product noun in the headline (drops gear/gadget coverage entirely)
    "\\b(power\\s?bank|charger|earbuds?|headphones?|airpods?|sm[ -]?watch|smartwatch|fitness tracker|" +
      "laptop|macbook|tablet|ipad|e-?reader|kindle|monitor|webcam|keyboards?|mouse|trackpad|router|" +
      "mesh wi-?fi|soundbar|speakers?|microphone|vacuum|robovac|air fryer|blender|mattress|" +
      "doorbell|thermostat|smart (?:bulb|plug|home|lock)|drone|gimbal|ssd|microsd|hard drive|" +
      "dash cam|projector|gaming chair|controller|console|graphics card|gpu deal)\\b",
    // gaming/mobile hardware + foldables/wearables/VR
    "\\b(xbox|playstation|ps5|ps4|nintendo|steam deck|rog ally|handheld|oled|qled|amoled|" +
      "smartphone|iphone|ipad|galaxy|pixel \\d|foldable|smart glasses|vr headset|ar glasses|wearable)\\b",
    // product-launch framing
    "\\b(unveil(s|ed)?|hands-on|first look|now available|pre-?orders?|just announced|new .{0,20}\\b(phone|laptop|tablet|headset|console|earbuds))\\b",
  ].join("|"),
  "i"
);
// Skip URL paths that are reviews/gear/deals/commerce regardless of title.
const GEAR_URL_RE = /\/(review|reviews|gear|recommends|deals|coupons|commerce|shopping|best-|via)\//i;

const STOP = new Set([
  "The", "A", "An", "How", "Why", "What", "When", "Who", "Where", "New", "This", "That",
  "Live", "Watch", "Could", "Will", "Has", "Have", "Is", "Are", "To", "In", "On", "Of",
  "For", "And", "But", "After", "Before", "Says", "My", "Your", "It", "We", "They", "Best",
  "First", "Here", "These", "Now", "More", "Most", "Inside", "Meet", "Can", "Review",
  "Tech", "Asked", "So", "Hands-On", "With", "Best", "Gave",
]);

// Near-duplicate detection so the same story under five outlet headlines doesn't fill the list.
const STOPW = new Set([
  "with","that","this","over","from","after","before","says","said","will","have","been","more","most",
  "into","than","then","they","them","their","what","when","where","your","about","could","would","should",
  "amid","year","week","live","news","update","latest","could","first","last","than","being","such","while",
  "uk's","new","how","why","who","its","but","and","for","the","not","out","off",
]);
function storyKeys(title: string) {
  const toks = title.toLowerCase().replace(/['’]s\b/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOPW.has(w));
  const uni = new Set(toks);
  const bi = new Set<string>();
  for (let i = 0; i < toks.length - 1; i++) bi.add(toks[i] + " " + toks[i + 1]);
  return { uni, bi };
}
type Keys = ReturnType<typeof storyKeys>;
function isDuplicateStory(c: Keys, accepted: Keys[]): boolean {
  for (const a of accepted) {
    for (const b of c.bi) if (a.bi.has(b)) return true;       // shared significant bigram (e.g. "henry nowak")
    let overlap = 0;
    for (const u of c.uni) if (a.uni.has(u) && ++overlap >= 3) return true;  // 3+ shared significant words
  }
  return false;
}

type NewsItem = { title: string; url: string; source: string; term: string; date: string; context?: string };
type Cache = { at: number; data: NewsItem[] };
const g = globalThis as unknown as { __news?: Record<string, Cache> };
const TTL = 5 * 60 * 1000;

function decode(s: string) {
  return s.replace(/<!\[CDATA\[|\]\]>/g, "")
    // numeric entities (decimal &#8216; and hex &#x2018;) → their character
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    // angle-bracket entities BEFORE the generic catch-all, so escaped HTML in a
    // title (e.g. Sky live-blog <a href> links) becomes real tags we can strip,
    // instead of leaking raw `a href='...'` attribute text into the headline.
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/gi, " ")
    .replace(/<[^>]*>/g, " ")   // drop any embedded HTML tags
    .replace(/&[a-z]+;/gi, " ") // unknown named entities → space
    .replace(/\s+/g, " ").trim();
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
    if (GEAR_RE.test(title)) continue;
    // link: RSS <link>url</link> or Atom <link href="url"/>
    const linkText = b.match(/<link>([\s\S]*?)<\/link>/i);
    const linkHref = b.match(/<link[^>]*href="([^"]+)"/i);
    const url = (linkText && linkText[1].trim()) || (linkHref && linkHref[1]) || "";
    if (url && GEAR_URL_RE.test(url)) continue;
    const dm = b.match(/<(?:pubDate|published|updated|dc:date)>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i);
    const date = dm ? dm[1].trim() : "";
    out.push({ title, url, source, term: termOf(title), date });
  }
  return out;
}

export async function GET(request: Request) {
  const param = new URL(request.url).searchParams.get("category") ?? DEFAULT_CATEGORY;
  if (!g.__news) g.__news = {};

  const CUSTOM: Record<string, () => Promise<NewsItem[]>> = {
    wikipedia: fetchWikipediaTop,
    guardian: fetchGuardianMostRead,
    github: fetchGithubTrending,
    google: fetchGoogleTrends,
    reuters: fetchReuters,
    bbc: fetchBbcMostRead,
    reddit: () => fetchReddit("news", "rising", "Reddit"),
    futurology: () => fetchReddit("Futurology", "new", "r/Futurology"),
  };
  if (CUSTOM[param]) {
    const cached = g.__news[param];
    if (cached && Date.now() - cached.at < TTL) {
      return NextResponse.json({ category: param, categories: CATEGORY_ORDER, topics: cached.data });
    }
    const data = await CUSTOM[param]();
    if (data.length) g.__news[param] = { at: Date.now(), data };
    return NextResponse.json({ category: param, categories: CATEGORY_ORDER, topics: data });
  }

  const category = CATEGORIES[param] ? param : DEFAULT_CATEGORY;
  const feeds = CATEGORIES[category];

  const cached = g.__news[category];
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json({ category, categories: CATEGORY_ORDER, topics: cached.data });
  }

  const all: NewsItem[] = [];
  await Promise.all(
    feeds.map(async (f) => {
      try {
        const res = await fetch(f.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }, signal: AbortSignal.timeout(8000) });
        const xml = await res.text();
        let items = parse(xml, f.source);
        if (f.match) items = items.filter((it) => it.url.includes(f.match!));
        all.push(...items.slice(0, 12)); // candidates per feed; single-feed cats (FT/Reddit) need ≥10
      } catch {
        /* skip */
      }
    })
  );
  // newest first, dedupe near-identical headlines, keep source variety while still hitting ~10.
  // Per-source cap scales with how many feeds the category has (few feeds → allow more each).
  all.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  const perSourceCap = Math.max(2, Math.ceil(10 / feeds.length));
  const seen = new Set<string>();
  const seenSrc = new Map<string, number>();
  const acceptedKeys: Keys[] = [];   // for content-based near-duplicate clustering
  const data: NewsItem[] = [];
  for (const it of all) {
    const key = it.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    const sc = seenSrc.get(it.source) ?? 0;
    if (sc >= perSourceCap) continue;
    const keys = storyKeys(it.title);
    if (isDuplicateStory(keys, acceptedKeys)) continue;   // same story, different outlet/headline → skip
    seenSrc.set(it.source, sc + 1);
    acceptedKeys.push(keys);
    data.push(it);
    if (data.length >= 10) break;
  }
  g.__news[category] = { at: Date.now(), data };
  return NextResponse.json({ category, categories: CATEGORY_ORDER, topics: data });
}

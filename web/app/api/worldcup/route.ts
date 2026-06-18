import { NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────
export type WCTeam = { id: string; name: string; abbr: string; flag: string };
export type WCStanding = {
  team: WCTeam; played: number; won: number; drawn: number; lost: number;
  gf: number; ga: number; gd: number; pts: number;
};
export type WCGroup = { id: string; name: string; standings: WCStanding[] };
export type WCOdds = { home: string; draw: string; away: string };
export type WCMatch = {
  id: string; round: string; date: string;
  label?: string;            // human round/stage label for the fixtures list
  status: "pre" | "in" | "post";
  statusDetail?: string;     // e.g. "FT", "HT", "67'"
  homeTeam: WCTeam | null; awayTeam: WCTeam | null;
  homeScore: number | null; awayScore: number | null;
  homeWinner: boolean; awayWinner: boolean;
  odds?: WCOdds;             // 3-way moneyline for upcoming matches (home / draw / away)
};
export type WCStats = {
  teams: number;
  matchesPlayed: number;
  totalMatches: number;
  goals: number;
  goalsPerMatch: number;
  liveNow: number;
};
export type WCNews = { title: string; source: string; url: string; summary?: string };
export type WCData = {
  groups: WCGroup[];
  knockout: { round: string; matches: WCMatch[] }[];
  thirdPlace: WCMatch | null;
  fixtures: WCMatch[];
  stats: WCStats;
  news: WCNews[];
  hasLive: boolean;
  updatedAt: string;
};

// ─── Cache ─────────────────────────────────────────────────────────────────────
const g = globalThis as unknown as { __wc?: { at: number; live: boolean; data: WCData } };
const TTL_LIVE = 2 * 60 * 1000;   // 2 min when a match is live
const TTL_IDLE = 5 * 60 * 1000;   // 5 min otherwise

// ─── Helpers ───────────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyObj = Record<string, any>;

function getStat(stats: { name: string; value: number }[], name: string): number {
  return stats?.find((s) => s.name === name)?.value ?? 0;
}
function mapTeam(team: AnyObj): WCTeam {
  return {
    id: String(team.id ?? ""),
    name: String(team.displayName ?? team.name ?? "TBD"),
    abbr: String(team.abbreviation ?? "???"),
    // standings endpoint uses logos[]; the scoreboard endpoint uses a single logo string.
    flag: (team.logos as { href: string }[] | undefined)?.[0]?.href ?? String(team.logo ?? ""),
  };
}
// ESPN American-odds: numbers come as "+155"/"-180" strings (or a bare number for draw).
function fmtOdds(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = typeof v === "number" ? (v > 0 ? `+${v}` : `${v}`) : String(v);
  return /^[+-]/.test(s) ? s : `+${s}`;
}
function mapOdds(comp: AnyObj): WCOdds | undefined {
  const o: AnyObj | undefined = (comp.odds as AnyObj[] | undefined)?.[0];
  if (!o) return undefined;
  const home = fmtOdds(o.moneyline?.home?.close?.odds ?? o.moneyline?.home?.open?.odds);
  const away = fmtOdds(o.moneyline?.away?.close?.odds ?? o.moneyline?.away?.open?.odds);
  const draw = fmtOdds(o.drawOdds?.moneyLine);
  return home && away && draw ? { home, draw, away } : undefined;
}

// ─── Fetchers ─────────────────────────────────────────────────────────────────
async function fetchGroups(): Promise<WCGroup[]> {
  const r = await fetch(
    "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings",
    { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
  );
  if (!r.ok) return [];
  const j: AnyObj = await r.json();

  // ESPN can nest groups under standings[] or children[].standings
  const raw: AnyObj[] = j?.standings ?? j?.children ?? [];

  return raw.map((group: AnyObj, gi: number) => {
    // entries live at group.entries OR nested under group.standings.entries (children[] shape)
    const entries: AnyObj[] = group.entries ?? (group.standings as AnyObj)?.entries ?? [];
    const standings = entries.map((entry: AnyObj) => {
      const team: AnyObj = entry.team ?? {};
      const stats: { name: string; value: number }[] = entry.stats ?? [];
      const gf = getStat(stats, "pointsFor");
      const ga = getStat(stats, "pointsAgainst");
      return {
        team: mapTeam(team),
        played: getStat(stats, "gamesPlayed"),
        won: getStat(stats, "wins"),
        drawn: getStat(stats, "ties"),
        lost: getStat(stats, "losses"),
        gf, ga, gd: gf - ga,
        pts: getStat(stats, "points"),
      };
    });
    // Guarantee real-time placing: FIFA tiebreakers (points, then goal difference,
    // then goals for). ESPN usually pre-sorts, but enforce it so the table is always right.
    standings.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.name.localeCompare(b.team.name));
    return {
      id: String(group.id ?? gi),
      name: String(group.name ?? group.shortName ?? `Group ${gi + 1}`),
      standings,
    };
  });
}

const KNOCKOUT_KEYWORDS = ["round of 32", "round of 16", "quarter", "semi", "final", "3rd", "third"];
const ROUND_ORDER = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"];

function normaliseRound(raw: string): string {
  const r = raw.toLowerCase();
  if (r.includes("round of 32")) return "Round of 32";
  if (r.includes("round of 16")) return "Round of 16";
  if (r.includes("quarter")) return "Quarterfinals";
  if (r.includes("semi")) return "Semifinals";
  if (r.includes("3rd") || r.includes("third")) return "3rd Place";
  if (r.includes("final")) return "Final";
  return raw;
}

// Returns ALL World Cup matches (group + knockout). The caller splits out the
// knockout rounds for the bracket and uses the full list for the fixtures view.
async function fetchMatches(): Promise<WCMatch[]> {
  // The default scoreboard only returns the CURRENT date window (~today's 4 matches), which
  // is why the fixtures list was never complete. Querying the full tournament date range
  // returns all 104 matches (group + knockout) with team flags and pre-match odds.
  const r = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=400",
    { signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store" }
  );
  if (!r.ok) return [];
  const j: AnyObj = await r.json();

  const matches: WCMatch[] = [];
  for (const event of (j?.events ?? []) as AnyObj[]) {
    const comp: AnyObj = (event.competitions ?? [])[0];
    if (!comp) continue;

    const roundRaw: string =
      (event.week as AnyObj)?.text ??
      (event.season as AnyObj)?.slug ??
      "Group Stage";

    const isKnockout = KNOCKOUT_KEYWORDS.some((k) => roundRaw.toLowerCase().includes(k));
    const normalRound = isKnockout ? normaliseRound(roundRaw) : "Group Stage";
    const groupName = (comp.notes as AnyObj[] | undefined)?.[0]?.headline as string | undefined;
    const prettySlug = roundRaw.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const label = isKnockout ? normalRound : (groupName || prettySlug || "Group Stage");

    const competitors: AnyObj[] = comp.competitors ?? [];
    const home = competitors.find((c: AnyObj) => c.homeAway === "home");
    const away = competitors.find((c: AnyObj) => c.homeAway === "away");
    const status: AnyObj = (comp.status as AnyObj) ?? {};
    const statusState: string = status?.type?.state ?? "pre";

    matches.push({
      id: String(event.id ?? ""),
      round: normalRound,
      label,
      date: String(event.date ?? ""),
      status: statusState === "in" ? "in" : statusState === "post" ? "post" : "pre",
      statusDetail: String(status?.type?.shortDetail ?? ""),
      homeTeam: home ? mapTeam(home.team ?? {}) : null,
      awayTeam: away ? mapTeam(away.team ?? {}) : null,
      homeScore: home?.score != null ? Number(home.score) : null,
      awayScore: away?.score != null ? Number(away.score) : null,
      homeWinner: Boolean(home?.winner),
      awayWinner: Boolean(away?.winner),
      odds: statusState === "pre" ? mapOdds(comp) : undefined,
    });
  }
  return matches;
}

// ─── World Cup news (Google News RSS — reliable from datacenter IPs) ─────────────
function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}
// No emojis anywhere on the site: strip pictographic emoji/symbol/flag blocks.
const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{2300}-\u{23FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]+/gu;
function stripEmoji(s: string): string {
  return s.replace(EMOJI_RE, "").replace(/ {2,}/g, " ").trim();
}

// Build an in-app summary from a Guardian RSS description. Prefer the <p> paragraphs
// (the real article lead) and skip <ul>/<li> related-link bullets, kick-off-time lines
// and nav boilerplate, so readers get the story without bouncing out to the publisher.
function htmlToSummary(html: string, max = 240): string {
  const decoded = decodeXml(html);
  const paras = [...decoded.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map((m) => m[1]);
  const body = paras.length ? paras.join(" ") : decoded;
  let t = stripEmoji(
    body.replace(/<a\b[^>]*>continue reading[\s\S]*?<\/a>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  t = t.replace(/news,?\s*build-?up and reaction\b[\s\S]*?(mail us here|wallchart|bracketology|full schedule)/i, "").trim();
  t = t.replace(/\b(player guide|bracketology|wallchart|mail us here|full schedule)\b\s*\|?\s*/gi, "").trim();
  t = t.replace(/^(kick-?off time[^.|]*[.|]?\s*)/i, "").replace(/^[|\s·-]+/, "").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return (lastStop > 80 ? cut.slice(0, lastStop + 1) : cut.trimEnd() + "…");
}

// Pull World-Cup items from one football RSS feed. All three carry real article
// summaries (unlike Google News), so the story reads in-app without bouncing out.
const NEWS_FEEDS: { url: string; source: string }[] = [
  { url: "https://www.theguardian.com/football/rss", source: "The Guardian" },
  { url: "https://feeds.bbci.co.uk/sport/football/rss.xml", source: "BBC Sport" },
  { url: "https://www.espn.com/espn/rss/soccer/news", source: "ESPN" },
];

async function fetchFeed(feed: { url: string; source: string }): Promise<WCNews[]> {
  try {
    const r = await fetch(feed.url, {
      signal: AbortSignal.timeout(8000), headers: { "User-Agent": "Mozilla/5.0" }, cache: "no-store",
    });
    if (!r.ok) return [];
    const xml = await r.text();
    const out: WCNews[] = [];
    for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = m[1];
      const title = stripEmoji(decodeXml(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? ""));
      const url = decodeXml(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "");
      const summary = htmlToSummary(block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "");
      if (!title || !url) continue;
      if (/[–-]\s*live\s*$/i.test(title)) continue;                       // skip live blogs
      if (!/world cup/i.test(title) && !/world cup/i.test(summary)) continue; // World Cup only
      out.push({ title, source: feed.source, url, summary });
    }
    return out;
  } catch { return []; }
}

async function fetchNews(): Promise<WCNews[]> {
  const perSource = await Promise.all(NEWS_FEEDS.map(fetchFeed));
  // Dedupe across sources by a loose title key (Guardian wins ties, it's first).
  const seen = new Set<string>();
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const cleaned = perSource.map((list) =>
    list.filter((n) => { const k = key(n.title); if (seen.has(k)) return false; seen.add(k); return true; }),
  );
  // Round-robin interleave so the list isn't dominated by one publication.
  const out: WCNews[] = [];
  for (let i = 0; out.length < 9; i++) {
    let progressed = false;
    for (const list of cleaned) {
      if (list[i]) { out.push(list[i]); progressed = true; if (out.length >= 9) break; }
    }
    if (!progressed) break;
  }
  return out;
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET() {
  const cached = g.__wc;
  const ttl = cached?.live ? TTL_LIVE : TTL_IDLE;
  if (cached && Date.now() - cached.at < ttl) return NextResponse.json(cached.data);

  try {
    const [groups, allMatches, news] = await Promise.all([fetchGroups(), fetchMatches(), fetchNews()]);

    // Split knockout matches by round (group-stage matches have round "Group Stage").
    const grouped = new Map<string, WCMatch[]>();
    let thirdPlace: WCMatch | null = null;
    for (const m of allMatches) {
      if (m.round === "3rd Place") { thirdPlace = m; continue; }
      if (ROUND_ORDER.includes(m.round)) {
        if (!grouped.has(m.round)) grouped.set(m.round, []);
        grouped.get(m.round)!.push(m);
      }
    }
    const knockout = ROUND_ORDER
      .filter((r) => grouped.has(r))
      .map((r) => ({ round: r, matches: grouped.get(r)! }));

    // Fixtures: every match, newest activity first is handled client-side; keep
    // chronological order here.
    const fixtures = [...allMatches].sort((a, b) => a.date.localeCompare(b.date));

    // Tournament stats / facts. Group-stage totals come from the cumulative standings
    // (accurate tournament-wide), knockout from the match list. The 2026 finals are a
    // fixed 48 teams / 104 matches.
    const gPlayed = groups.reduce((n, gr) => n + gr.standings.reduce((m, s) => m + s.played, 0), 0) / 2;
    const gGoals = groups.reduce((n, gr) => n + gr.standings.reduce((m, s) => m + s.gf, 0), 0);
    const koDone = allMatches.filter((m) => ROUND_ORDER.includes(m.round) && m.status === "post");
    const koGoals = koDone.reduce((n, m) => n + (m.homeScore ?? 0) + (m.awayScore ?? 0), 0);
    const matchesPlayed = Math.round(gPlayed) + koDone.length;
    const goals = gGoals + koGoals;
    const teams = groups.reduce((n, gr) => n + gr.standings.length, 0) || 48;
    const liveNow = allMatches.filter((m) => m.status === "in").length;
    const stats: WCStats = {
      teams,
      matchesPlayed,
      totalMatches: 104,
      goals,
      goalsPerMatch: matchesPlayed ? Math.round((goals / matchesPlayed) * 100) / 100 : 0,
      liveNow,
    };

    const hasLive = liveNow > 0;
    const data: WCData = { groups, knockout, thirdPlace, fixtures, stats, news, hasLive, updatedAt: new Date().toISOString() };
    g.__wc = { at: Date.now(), live: hasLive, data };
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

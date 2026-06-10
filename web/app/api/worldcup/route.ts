import { NextResponse } from "next/server";

// ─── Types ────────────────────────────────────────────────────────────────────
export type WCTeam = { id: string; name: string; abbr: string; flag: string };
export type WCStanding = {
  team: WCTeam; played: number; won: number; drawn: number; lost: number;
  gf: number; ga: number; gd: number; pts: number;
};
export type WCGroup = { id: string; name: string; standings: WCStanding[] };
export type WCMatch = {
  id: string; round: string; date: string;
  status: "pre" | "in" | "post";
  homeTeam: WCTeam | null; awayTeam: WCTeam | null;
  homeScore: number | null; awayScore: number | null;
  homeWinner: boolean; awayWinner: boolean;
};
export type WCData = {
  groups: WCGroup[];
  knockout: { round: string; matches: WCMatch[] }[];
  thirdPlace: WCMatch | null;
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
    flag: (team.logos as { href: string }[] | undefined)?.[0]?.href ?? "",
  };
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
    return {
      id: String(group.id ?? gi),
      name: String(group.name ?? group.shortName ?? `Group ${gi + 1}`),
      standings: entries.map((entry: AnyObj) => {
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
      }),
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

async function fetchMatches(): Promise<WCMatch[]> {
  const r = await fetch(
    "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?limit=200",
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

    const normalRound = normaliseRound(roundRaw);
    const isKnockout = KNOCKOUT_KEYWORDS.some((k) => roundRaw.toLowerCase().includes(k));
    if (!isKnockout) continue;

    const competitors: AnyObj[] = comp.competitors ?? [];
    const home = competitors.find((c: AnyObj) => c.homeAway === "home");
    const away = competitors.find((c: AnyObj) => c.homeAway === "away");
    const statusState: string = (comp.status as AnyObj)?.type?.state ?? "pre";

    matches.push({
      id: String(event.id ?? ""),
      round: normalRound,
      date: String(event.date ?? ""),
      status: statusState === "in" ? "in" : statusState === "post" ? "post" : "pre",
      homeTeam: home ? mapTeam(home.team ?? {}) : null,
      awayTeam: away ? mapTeam(away.team ?? {}) : null,
      homeScore: home?.score != null ? Number(home.score) : null,
      awayScore: away?.score != null ? Number(away.score) : null,
      homeWinner: Boolean(home?.winner),
      awayWinner: Boolean(away?.winner),
    });
  }
  return matches;
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function GET() {
  const cached = g.__wc;
  const ttl = cached?.live ? TTL_LIVE : TTL_IDLE;
  if (cached && Date.now() - cached.at < ttl) return NextResponse.json(cached.data);

  try {
    const [groups, allMatches] = await Promise.all([fetchGroups(), fetchMatches()]);

    // Split knockout matches by round
    const grouped = new Map<string, WCMatch[]>();
    let thirdPlace: WCMatch | null = null;
    for (const m of allMatches) {
      if (m.round === "3rd Place") { thirdPlace = m; continue; }
      if (!grouped.has(m.round)) grouped.set(m.round, []);
      grouped.get(m.round)!.push(m);
    }
    const knockout = ROUND_ORDER
      .filter((r) => grouped.has(r))
      .map((r) => ({ round: r, matches: grouped.get(r)! }));

    const hasLive = allMatches.some((m) => m.status === "in");
    const data: WCData = { groups, knockout, thirdPlace, hasLive, updatedAt: new Date().toISOString() };
    g.__wc = { at: Date.now(), live: hasLive, data };
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}

"use client";
import { useEffect, useRef, useState } from "react";
import { SwipeView, centerActivePill } from "@/components/SwipeView";
import type { WCData, WCGroup, WCMatch, WCStanding, WCTeam, WCStats, WCNews } from "@/app/api/worldcup/route";

// ─── Bracket layout constants ─────────────────────────────────────────────────
const CARD_H = 70;   // px — two 35px team rows
const CARD_W = 172;  // px — card width
const SLOT_H = 84;   // px — vertical slot per R32 match (SLOT_H > CARD_H leaves breathing room)
const COL_GAP = 48;  // px — horizontal gap between round columns (connector lives here)
const COL_W = CARD_W + COL_GAP;
const LABEL_H = 26;  // px — row above bracket for round titles
const TOTAL_H = 16 * SLOT_H; // 1344px — bracket body height (16 = R32 match count)
const SVG_H = TOTAL_H + LABEL_H;
const SVG_W = 5 * COL_W + CARD_W; // 5 rounds: R32→R16→QF→SF→Final

const ROUNDS = ["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"] as const;
const ROUND_SHORT: Record<string, string> = {
  "Round of 32": "R32", "Round of 16": "R16",
  "Quarterfinals": "QF", "Semifinals": "SF", "Final": "Final",
};

// Vertical midpoint of match card i in round r (0 = R32)
function midY(r: number, i: number): number {
  return i * Math.pow(2, r) * SLOT_H + Math.pow(2, r) * SLOT_H / 2 + LABEL_H;
}
// Top of match card i in round r
function cardTop(r: number, i: number): number {
  const slotH = Math.pow(2, r) * SLOT_H;
  return i * slotH + (slotH - CARD_H) / 2 + LABEL_H;
}

// ─── Flag ───────────────────────────────────────────────────────────────────
function Flag({ team, w = 24 }: { team: WCTeam | null; w?: number }) {
  const h = Math.round(w * 0.7);
  if (team?.flag) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={team.flag} alt="" width={w} height={h} style={{ objectFit: "cover", borderRadius: 3, flexShrink: 0, display: "block" }} />;
  }
  return <span style={{ width: w, height: h, background: "var(--border)", borderRadius: 3, flexShrink: 0, display: "block" }} />;
}

// ─── Empty / placeholder match ────────────────────────────────────────────────
function emptyMatch(round: string, i: number): WCMatch {
  return { id: `tbd-${round}-${i}`, round, date: "", status: "pre", homeTeam: null, awayTeam: null, homeScore: null, awayScore: null, homeWinner: false, awayWinner: false };
}

// ─── Stats tiles (tournament facts) ───────────────────────────────────────────
function StatsTiles({ stats }: { stats: WCStats }) {
  const tiles: { label: string; value: string }[] = [
    { label: "Teams", value: String(stats.teams) },
    { label: "Matches played", value: `${stats.matchesPlayed} / ${stats.totalMatches}` },
    { label: "Goals scored", value: String(stats.goals) },
    { label: "Goals per match", value: stats.matchesPlayed ? stats.goalsPerMatch.toFixed(2) : "—" },
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.6rem", marginBottom: "1.1rem" }}>
      {tiles.map((t) => (
        <div key={t.label} className="panel" style={{ padding: "0.85rem 1rem" }}>
          <div style={{ fontSize: "1.6rem", fontWeight: 800, lineHeight: 1.05, letterSpacing: "-0.02em" }}>{t.value}</div>
          <div style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.25rem", textTransform: "uppercase", letterSpacing: "0.06em" }}>{t.label}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Team row (used inside bracket match card) ───────────────────────────────
function TeamRow({ team, score, winner, live, borderBottom }: {
  team: WCTeam | null; score: number | null; winner: boolean; live: boolean; borderBottom: boolean;
}) {
  return (
    <div style={{
      height: "50%", display: "flex", alignItems: "center", gap: 6, padding: "0 7px",
      borderBottom: borderBottom ? "1px solid var(--border)" : undefined,
      background: winner ? "color-mix(in srgb, var(--up) 12%, transparent)" : "transparent",
    }}>
      <Flag team={team} w={18} />
      <span style={{
        flex: 1, fontSize: "0.78rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontWeight: winner ? 600 : 400,
        color: team ? "var(--text)" : "var(--muted)",
      }}>
        {team?.abbr ?? "TBD"}
      </span>
      {(score !== null) && (
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: live ? "var(--accent)" : "var(--text)", minWidth: 14, textAlign: "right" }}>
          {score}
        </span>
      )}
    </div>
  );
}

// ─── Bracket match card ──────────────────────────────────────────────────────
function MatchCard({ match, champion }: { match: WCMatch; champion?: boolean }) {
  const live = match.status === "in";
  return (
    <div style={{
      width: CARD_W, height: CARD_H,
      border: `1px solid ${champion ? "var(--accent)" : live ? "var(--accent)" : "var(--border)"}`,
      borderRadius: 5, overflow: "hidden", background: "var(--panel)",
      boxShadow: (live || champion) ? "0 0 0 2px color-mix(in srgb, var(--accent) 20%, transparent)" : undefined,
    }}>
      <TeamRow team={match.homeTeam} score={match.homeScore} winner={match.homeWinner} live={live} borderBottom />
      <TeamRow team={match.awayTeam} score={match.awayScore} winner={match.awayWinner} live={live} borderBottom={false} />
    </div>
  );
}

// ─── Bracket view ─────────────────────────────────────────────────────────────
function BracketView({ knockout, thirdPlace }: { knockout: WCData["knockout"]; thirdPlace: WCMatch | null }) {
  const roundMap = new Map(knockout.map((r) => [r.round, r.matches]));
  const anyMatches = knockout.some((r) => r.matches.length);

  const rounds = ROUNDS.map((name, r) => {
    const count = 16 / Math.pow(2, r); // 16, 8, 4, 2, 1
    const existing = roundMap.get(name) ?? [];
    const matches: WCMatch[] = Array.from({ length: count }, (_, i) => existing[i] ?? emptyMatch(name, i));
    return { name, r, matches };
  });

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let r = 0; r < ROUNDS.length - 1; r++) {
    const nNext = rounds[r + 1].matches.length;
    for (let j = 0; j < nNext; j++) {
      const xFrom = r * COL_W + CARD_W;
      const xMid = r * COL_W + CARD_W + COL_GAP / 2;
      const xTo = (r + 1) * COL_W;
      const yTop = midY(r, 2 * j);
      const yBot = midY(r, 2 * j + 1);
      const yCon = midY(r + 1, j);
      lines.push({ x1: xFrom, y1: yTop, x2: xMid, y2: yTop });
      lines.push({ x1: xFrom, y1: yBot, x2: xMid, y2: yBot });
      lines.push({ x1: xMid, y1: yTop, x2: xMid, y2: yBot });
      lines.push({ x1: xMid, y1: yCon, x2: xTo, y2: yCon });
    }
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "76vh" }}>
      {!anyMatches && (
        <p style={{ fontSize: "0.9rem", color: "var(--muted)", marginBottom: "1rem" }}>
          The knockout bracket fills in once the group stage finishes.
        </p>
      )}
      <div style={{ position: "relative", width: SVG_W, height: SVG_H, minWidth: SVG_W }}>
        {rounds.map(({ name, r }) => (
          <div key={name} style={{
            position: "absolute", left: r * COL_W, top: 4, width: CARD_W, textAlign: "center",
            fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--accent)",
          }}>
            {ROUND_SHORT[name] ?? name}
          </div>
        ))}
        <svg style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }} width={SVG_W} height={SVG_H}>
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--border)" strokeWidth={1} />
          ))}
        </svg>
        {rounds.map(({ r, matches, name }) =>
          matches.map((match, i) => {
            const isChampion = name === "Final" && match.status === "post" && (match.homeWinner || match.awayWinner);
            return (
              <div key={match.id} style={{ position: "absolute", left: r * COL_W, top: cardTop(r, i) }}>
                <MatchCard match={match} champion={isChampion} />
              </div>
            );
          })
        )}
      </div>
      {thirdPlace && (
        <div style={{ marginTop: "1.5rem", paddingTop: "1rem", borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.5rem" }}>
            3rd Place
          </div>
          <MatchCard match={thirdPlace} />
        </div>
      )}
    </div>
  );
}

// ─── Groups view (larger, readable tables) ────────────────────────────────────
function StandingRow({ s, pos }: { s: WCStanding; pos: number }) {
  const bg = pos <= 2
    ? "color-mix(in srgb, var(--up) 10%, transparent)"
    : pos === 3
      ? "color-mix(in srgb, var(--accent) 8%, transparent)"
      : "transparent";
  const gdStr = s.gd > 0 ? `+${s.gd}` : String(s.gd);
  const num = { padding: "0.55rem 0.3rem", fontSize: "0.85rem", textAlign: "right" as const, color: "var(--muted)" };
  return (
    <tr style={{ borderTop: "1px solid var(--border)", background: bg }}>
      <td style={{ padding: "0.55rem 0.35rem 0.55rem 0.7rem", color: "var(--muted)", fontSize: "0.8rem", width: 22, fontWeight: 600 }}>{pos}</td>
      <td style={{ padding: "0.55rem 0.3rem", width: 28 }}><Flag team={s.team} w={24} /></td>
      <td style={{ padding: "0.55rem 0.5rem 0.55rem 0.35rem", fontSize: "0.95rem", fontWeight: 600, maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {s.team.name}
      </td>
      <td style={num}>{s.played}</td>
      <td style={num}>{s.won}</td>
      <td style={num}>{s.drawn}</td>
      <td style={num}>{s.lost}</td>
      <td style={{ ...num, color: "var(--text)" }}>{gdStr}</td>
      <td style={{ padding: "0.55rem 0.7rem 0.55rem 0.35rem", fontSize: "0.95rem", textAlign: "right", fontWeight: 800 }}>{s.pts}</td>
    </tr>
  );
}

function GroupCard({ group }: { group: WCGroup }) {
  const th = { fontSize: "0.7rem", color: "var(--muted)", fontWeight: 600, textAlign: "right" as const, padding: "0 0.3rem 0.4rem", width: 26 };
  return (
    <div className="panel" style={{ padding: "0.9rem 0 0.5rem", overflow: "hidden" }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--accent)", padding: "0 0.7rem", marginBottom: "0.5rem" }}>
        {group.name}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th colSpan={3} />
            {["P", "W", "D", "L", "GD", "Pts"].map((h) => (
              <th key={h} style={{ ...th, width: h === "Pts" ? 36 : 26 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.standings.map((s, i) => <StandingRow key={s.team.id} s={s} pos={i + 1} />)}
        </tbody>
      </table>
      <div style={{ fontSize: "0.68rem", color: "var(--muted)", padding: "0.6rem 0.7rem 0.1rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "color-mix(in srgb, var(--up) 45%, transparent)" }} />
          Advance
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: "color-mix(in srgb, var(--accent) 40%, transparent)" }} />
          May advance
        </span>
      </div>
    </div>
  );
}

function GroupsView({ groups }: { groups: WCGroup[] }) {
  if (!groups.length) {
    return <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Group data not yet available.</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "1rem" }}>
      {groups.map((g) => <GroupCard key={g.id} group={g} />)}
    </div>
  );
}

// ─── Fixtures view (matches grouped by date) ──────────────────────────────────
function fmtDateHeading(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "Date TBC";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long" });
}
function kickoff(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function FixtureRow({ m, first }: { m: WCMatch; first?: boolean }) {
  const live = m.status === "in";
  const done = m.status === "post";
  // ESPN returns score 0 (not null) for unplayed matches, so only show a scoreline
  // once a match is live or finished; upcoming matches show their kickoff time.
  const hasScore = (live || done) && m.homeScore !== null && m.awayScore !== null;
  const centre = hasScore
    ? `${m.homeScore} – ${m.awayScore}`
    : kickoff(m.date) || "TBC";
  const statusLabel = live ? (m.statusDetail || "LIVE") : done ? (m.statusDetail || "FT") : (m.label || "");
  return (
    <div style={{ borderTop: first ? "none" : "1px solid var(--border)" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", gap: "0.75rem",
        padding: "0.7rem 0.9rem",
      }}>
        {/* home */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.55rem", minWidth: 0 }}>
          <span style={{ fontSize: "0.92rem", fontWeight: m.homeWinner ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
            {m.homeTeam?.name ?? "TBD"}
          </span>
          <Flag team={m.homeTeam} w={24} />
        </div>
        {/* score / time */}
        <div style={{ textAlign: "center", minWidth: 64 }}>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: live ? "var(--accent)" : "var(--text)", letterSpacing: "0.02em" }}>{centre}</div>
          <div style={{ fontSize: "0.62rem", color: live ? "var(--accent)" : "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{statusLabel}</div>
        </div>
        {/* away */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", minWidth: 0 }}>
          <Flag team={m.awayTeam} w={24} />
          <span style={{ fontSize: "0.92rem", fontWeight: m.awayWinner ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {m.awayTeam?.name ?? "TBD"}
          </span>
        </div>
      </div>
      {/* pre-match 3-way odds (1 = home win, X = draw, 2 = away win) */}
      {m.status === "pre" && m.odds && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.4rem", padding: "0 0.9rem 0.6rem", marginTop: "-0.15rem", flexWrap: "wrap" }}>
          {([["1", m.odds.home], ["X", m.odds.draw], ["2", m.odds.away]] as const).map(([k, v]) => (
            <span key={k} style={{ fontSize: "0.68rem", color: "var(--muted)", border: "1px solid var(--border)", borderRadius: 4, padding: "1px 7px", whiteSpace: "nowrap" }}>
              <span style={{ opacity: 0.65 }}>{k}</span> <span style={{ fontWeight: 600, color: "var(--text)" }}>{v}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function FixturesView({ fixtures }: { fixtures: WCMatch[] }) {
  // Only upcoming (and currently-live) matches — drop games that have already finished.
  const upcoming = fixtures.filter((m) => m.status !== "post");
  if (!upcoming.length) {
    return <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>No upcoming fixtures.</div>;
  }
  // Group by calendar day, keeping chronological order.
  const byDay = new Map<string, WCMatch[]>();
  for (const m of upcoming) {
    const day = (m.date || "").slice(0, 10) || "tbc";
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(m);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.1rem" }}>
      {[...byDay.entries()].map(([day, ms]) => (
        <div key={day}>
          <div style={{ fontSize: "0.74rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--muted)", marginBottom: "0.5rem" }}>
            {fmtDateHeading(ms[0].date)}
          </div>
          <div className="panel" style={{ overflow: "hidden" }}>
            {ms.map((m, i) => <FixtureRow key={m.id} m={m} first={i === 0} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── News (read in-app: headline + summary, no bounce-out) ────────────────────
function NewsView({ news }: { news: WCNews[] }) {
  if (!news.length) {
    return <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>No World Cup news right now.</div>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
      {news.map((n, i) => (
        <div key={i} className="panel" style={{ padding: "1rem 1.1rem" }}>
          <div style={{ fontSize: "1rem", fontWeight: 600, lineHeight: 1.4, marginBottom: n.summary ? "0.5rem" : 0 }}>
            {n.title}
          </div>
          {n.summary && (
            <p style={{ fontSize: "0.92rem", lineHeight: 1.6, color: "var(--muted)" }}>{n.summary}</p>
          )}
          <div style={{ marginTop: "0.6rem", fontSize: "0.74rem", color: "var(--muted)", display: "flex", gap: "0.6rem", alignItems: "center" }}>
            <span>{n.source}</span>
            {n.url && (
              <a href={n.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "none" }}>
                source ↗︎
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
type WCTab = "groups" | "stats" | "news" | "fixtures" | "bracket";

export default function WorldCupChart() {
  const [data, setData] = useState<WCData | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<WCTab>("groups");
  const [slideDir, setSlideDir] = useState(1);
  const pillsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const r = await fetch("/api/worldcup");
        if (!r.ok) { setError(true); return; }
        const d: WCData = await r.json();
        if (!cancelled) setData(d);
      } catch { if (!cancelled) setError(true); }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Poll during live matches
  useEffect(() => {
    if (!data?.hasLive) return;
    const t = setInterval(async () => {
      try {
        const r = await fetch("/api/worldcup");
        if (r.ok) setData(await r.json());
      } catch {}
    }, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, [data?.hasLive]);

  const TABS: { id: WCTab; label: string }[] = [
    { id: "groups", label: "Group Stage" },
    { id: "news", label: "News" },
    { id: "fixtures", label: "Fixtures" },
    { id: "bracket", label: "Bracket" },
    { id: "stats", label: "Stats" },
  ];
  const tabIdx = TABS.findIndex((t) => t.id === tab);

  // Switch tab with a directional slide (whether swiped or tapped).
  const goToTab = (id: WCTab) => {
    setSlideDir(TABS.findIndex((t) => t.id === id) >= tabIdx ? 1 : -1);
    setTab(id);
  };
  // Keep the active tab pill scrolled into view as you swipe/tap through tabs.
  useEffect(() => {
    centerActivePill(pillsRef.current, (el) => el.dataset.wcTab === tab);
  }, [tab]);

  return (
    <div>
      {/* Tab bar + status — Stats now lives in its own pill, not as an always-on header */}
      <div ref={pillsRef} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", overflowX: "auto" }} className="no-scrollbar">
        {TABS.map((t) => (
          <button key={t.id} data-wc-tab={t.id} className="chip shrink-0 whitespace-nowrap" onClick={() => goToTab(t.id)}
            style={tab === t.id ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
            {t.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: "0.72rem", color: "var(--muted)", whiteSpace: "nowrap" }} className="shrink-0 pl-2">
          {data?.hasLive && <span style={{ color: "var(--accent)" }}>● Live · </span>}
          {data && <>Updated {new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}
        </span>
      </div>

      {error && <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>World Cup data unavailable right now.</div>}
      {!data && !error && <div style={{ fontSize: "0.9rem", color: "var(--muted)" }}>Loading…</div>}

      {data && (
        <SwipeView
          pageKey={tab}
          dir={slideDir}
          hasPrev={tabIdx > 0}
          hasNext={tabIdx < TABS.length - 1}
          onPrev={() => { if (tabIdx > 0) goToTab(TABS[tabIdx - 1].id); }}
          onNext={() => { if (tabIdx < TABS.length - 1) goToTab(TABS[tabIdx + 1].id); }}
        >
          {tab === "groups" && <GroupsView groups={data.groups} />}
          {tab === "stats" && <StatsTiles stats={data.stats} />}
          {tab === "news" && <NewsView news={data.news} />}
          {tab === "fixtures" && <FixturesView fixtures={data.fixtures} />}
          {tab === "bracket" && <BracketView knockout={data.knockout} thirdPlace={data.thirdPlace} />}
        </SwipeView>
      )}
    </div>
  );
}

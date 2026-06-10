"use client";
import { useEffect, useState } from "react";
import type { WCData, WCGroup, WCMatch, WCStanding, WCTeam } from "@/app/api/worldcup/route";

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

// ─── Empty / placeholder match ────────────────────────────────────────────────
function emptyMatch(round: string, i: number): WCMatch {
  return { id: `tbd-${round}-${i}`, round, date: "", status: "pre", homeTeam: null, awayTeam: null, homeScore: null, awayScore: null, homeWinner: false, awayWinner: false };
}

// ─── Team row (used inside match card) ───────────────────────────────────────
function TeamRow({ team, score, winner, live, borderBottom }: {
  team: WCTeam | null; score: number | null; winner: boolean; live: boolean; borderBottom: boolean;
}) {
  return (
    <div style={{
      height: "50%", display: "flex", alignItems: "center", gap: 6, padding: "0 7px",
      borderBottom: borderBottom ? "1px solid var(--border)" : undefined,
      background: winner ? "color-mix(in srgb, var(--up) 12%, transparent)" : "transparent",
    }}>
      {team?.flag ? (
        <img src={team.flag} alt="" width={18} height={13} style={{ objectFit: "cover", borderRadius: 2, flexShrink: 0 }} />
      ) : (
        <span style={{ width: 18, height: 13, background: "var(--border)", borderRadius: 2, flexShrink: 0, display: "block" }} />
      )}
      <span style={{
        flex: 1, fontSize: "0.75rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        fontWeight: winner ? 600 : 400,
        color: team ? "var(--text)" : "var(--muted)",
      }}>
        {team?.abbr ?? "TBD"}
      </span>
      {(score !== null) && (
        <span style={{ fontSize: "0.75rem", fontWeight: 700, color: live ? "var(--accent)" : "var(--text)", minWidth: 14, textAlign: "right" }}>
          {score}
        </span>
      )}
    </div>
  );
}

// ─── Match card ────────────────────────────────────────────────────────────────
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

  // Build padded round data — fill missing matches with TBD placeholders
  const rounds = ROUNDS.map((name, r) => {
    const count = 16 / Math.pow(2, r); // 16, 8, 4, 2, 1
    const existing = roundMap.get(name) ?? [];
    const matches: WCMatch[] = Array.from({ length: count }, (_, i) => existing[i] ?? emptyMatch(name, i));
    return { name, r, matches };
  });

  // Build SVG connector lines
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
      // Horizontal from top match → vertical bar
      lines.push({ x1: xFrom, y1: yTop, x2: xMid, y2: yTop });
      // Horizontal from bottom match → vertical bar
      lines.push({ x1: xFrom, y1: yBot, x2: xMid, y2: yBot });
      // Vertical bar connecting the two
      lines.push({ x1: xMid, y1: yTop, x2: xMid, y2: yBot });
      // Horizontal from midpoint → next round card
      lines.push({ x1: xMid, y1: yCon, x2: xTo, y2: yCon });
    }
  }

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "76vh" }}>
      <div style={{ position: "relative", width: SVG_W, height: SVG_H, minWidth: SVG_W }}>

        {/* Round labels */}
        {rounds.map(({ name, r }) => (
          <div key={name} style={{
            position: "absolute", left: r * COL_W, top: 4, width: CARD_W, textAlign: "center",
            fontSize: "0.6rem", fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--accent)",
          }}>
            {ROUND_SHORT[name] ?? name}
          </div>
        ))}

        {/* Connector lines */}
        <svg style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }} width={SVG_W} height={SVG_H}>
          {lines.map((l, i) => (
            <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="var(--border)" strokeWidth={1} />
          ))}
        </svg>

        {/* Match cards */}
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

      {/* 3rd place match — shown below bracket */}
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

// ─── Groups view ──────────────────────────────────────────────────────────────
function StandingRow({ s, pos }: { s: WCStanding; pos: number }) {
  // Positions 1-2 definitely advance, position 3 might advance (best 8 third-place)
  const bg = pos <= 2
    ? "color-mix(in srgb, var(--up) 9%, transparent)"
    : pos === 3
      ? "color-mix(in srgb, var(--accent) 7%, transparent)"
      : "transparent";
  const gdStr = s.gd > 0 ? `+${s.gd}` : String(s.gd);
  return (
    <tr style={{ borderTop: "1px solid var(--border)", background: bg }}>
      <td style={{ padding: "0.28rem 0.3rem 0.28rem 0.5rem", color: "var(--muted)", fontSize: "0.65rem", width: 14 }}>{pos}</td>
      <td style={{ padding: "0.28rem 0.25rem" }}>
        {s.team.flag
          ? <img src={s.team.flag} alt="" width={17} height={12} style={{ objectFit: "cover", borderRadius: 2, display: "block" }} />
          : <span style={{ width: 17, height: 12, background: "var(--border)", borderRadius: 2, display: "block" }} />}
      </td>
      <td style={{ padding: "0.28rem 0.4rem 0.28rem 0.3rem", fontSize: "0.77rem", maxWidth: 84, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {s.team.name}
      </td>
      <td style={{ padding: "0.28rem 0.25rem", fontSize: "0.72rem", textAlign: "right", color: "var(--muted)" }}>{s.played}</td>
      <td style={{ padding: "0.28rem 0.25rem", fontSize: "0.72rem", textAlign: "right", color: "var(--muted)" }}>{s.won}</td>
      <td style={{ padding: "0.28rem 0.25rem", fontSize: "0.72rem", textAlign: "right", color: "var(--muted)" }}>{s.drawn}</td>
      <td style={{ padding: "0.28rem 0.25rem", fontSize: "0.72rem", textAlign: "right", color: "var(--muted)" }}>{s.lost}</td>
      <td style={{ padding: "0.28rem 0.25rem", fontSize: "0.72rem", textAlign: "right", color: "var(--muted)" }}>{gdStr}</td>
      <td style={{ padding: "0.28rem 0.5rem 0.28rem 0.25rem", fontSize: "0.77rem", textAlign: "right", fontWeight: 700 }}>{s.pts}</td>
    </tr>
  );
}

function GroupCard({ group }: { group: WCGroup }) {
  return (
    <div className="panel" style={{ padding: "0.65rem 0", overflow: "hidden" }}>
      <div style={{ fontSize: "0.62rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--accent)", padding: "0 0.5rem", marginBottom: "0.35rem" }}>
        {group.name}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th colSpan={3} />
            {["P", "W", "D", "L", "GD", "Pts"].map((h) => (
              <th key={h} style={{ fontSize: "0.62rem", color: "var(--muted)", fontWeight: 400, textAlign: "right", padding: "0 0.25rem 0.25rem", width: h === "Pts" ? 28 : 20 }}>
                {h}
              </th>
            ))}
            <th style={{ width: 8 }} />
          </tr>
        </thead>
        <tbody>
          {group.standings.map((s, i) => <StandingRow key={s.team.id} s={s} pos={i + 1} />)}
        </tbody>
      </table>
      <div style={{ fontSize: "0.58rem", color: "var(--muted)", padding: "0.4rem 0.5rem 0", display: "flex", gap: "0.75rem" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "color-mix(in srgb, var(--up) 40%, transparent)" }} />
          Advance
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "color-mix(in srgb, var(--accent) 35%, transparent)" }} />
          May advance
        </span>
      </div>
    </div>
  );
}

function GroupsView({ groups }: { groups: WCGroup[] }) {
  if (!groups.length) {
    return <div className="label" style={{ color: "var(--muted)" }}>Group data not yet available.</div>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: "0.75rem" }}>
      {groups.map((g) => <GroupCard key={g.id} group={g} />)}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WorldCupChart() {
  const [data, setData] = useState<WCData | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"groups" | "bracket">("groups");

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

  return (
    <div>
      {/* Tab bar + status */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        {(["groups", "bracket"] as const).map((t) => (
          <button key={t} className="chip" onClick={() => setTab(t)}
            style={tab === t ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
            {t === "groups" ? "Group Stage" : "Bracket"}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--muted)" }}>
          {data?.hasLive && <><span style={{ color: "var(--accent)" }}>● Live · </span></>}
          {data && <>Updated {new Date(data.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</>}
        </span>
      </div>

      {error && <div className="label" style={{ color: "var(--muted)" }}>World Cup data unavailable right now.</div>}
      {!data && !error && <div className="label" style={{ color: "var(--muted)" }}>Loading…</div>}

      {data && tab === "groups" && <GroupsView groups={data.groups} />}
      {data && tab === "bracket" && <BracketView knockout={data.knockout} thirdPlace={data.thirdPlace} />}
    </div>
  );
}

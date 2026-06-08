"use client";
import { useEffect, useMemo, useState } from "react";

type Pt = { t: number; o: number; h: number; l: number; c: number; v: number };
type Quote = { name: string; symbol: string; price: number; changePct: number; up: boolean };
type ChartData = { symbol: string; range: string; points: Pt[]; prevClose: number; currency: string };

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtVol = (n: number) =>
  n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);

const RANGES: { id: string; label: string }[] = [
  { id: "1d", label: "1D" }, { id: "5d", label: "5D" }, { id: "1mo", label: "1M" },
  { id: "6mo", label: "6M" }, { id: "1y", label: "1Y" }, { id: "5y", label: "5Y" },
];

// Catmull-Rom → cubic-bezier: a smooth curve through all points (no chunky angles).
function smoothPath(p: { x: number; y: number }[]): string {
  if (p.length < 2) return p.length ? `M ${p[0].x},${p[0].y}` : "";
  let d = `M ${p[0].x},${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

// ── Interactive line chart: smooth spline + OHLC/Volume crosshair tooltip ───────
function PriceChart({ data }: { data: ChartData }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 920, H = 300, PADL = 8, PADR = 64, PADY = 18;
  const pts = data.points;

  const { min, maxV, x, y } = useMemo(() => {
    const lows = pts.map((p) => p.l ?? p.c), highs = pts.map((p) => p.h ?? p.c);
    const mn = Math.min(...lows, data.prevClose || Infinity);
    const mx = Math.max(...highs, data.prevClose || -Infinity);
    const span = mx - mn || 1;
    return {
      min: mn, maxV: mx,
      x: (i: number) => PADL + (i / (pts.length - 1 || 1)) * (W - PADL - PADR),
      y: (v: number) => PADY + (1 - (v - mn) / span) * (H - PADY * 2),
    };
  }, [pts, data.prevClose]);

  if (pts.length < 2) return <p className="label py-8 text-center">No chart data.</p>;

  const last = pts[pts.length - 1].c;
  const up = last >= data.prevClose;
  const stroke = up ? "var(--up)" : "var(--down)";
  const coords = pts.map((p, i) => ({ x: x(i), y: y(p.c) }));
  const path = smoothPath(coords);
  const area = `${path} L ${x(pts.length - 1).toFixed(1)},${y(min).toFixed(1)} L ${PADL},${y(min).toFixed(1)} Z`;

  const hi = hover != null ? pts[hover] : null;
  const dt = (t: number, withTime: boolean) => {
    const d = new Date(t);
    return withTime
      ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };
  const intraday = data.range === "1d" || data.range === "5d";
  const hoverFrac = hover != null ? hover / (pts.length - 1) : 0;

  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const i = Math.round(((px - PADL) / (W - PADL - PADR)) * (pts.length - 1));
          setHover(Math.max(0, Math.min(pts.length - 1, i)));
        }}
        onMouseLeave={() => setHover(null)}
      >
        {/* y gridlines + right-side labels (Yahoo-style) */}
        {[maxV, (3 * maxV + min) / 4, (maxV + min) / 2, (maxV + 3 * min) / 4, min].map((v, i) => (
          <g key={i}>
            <line x1={PADL} y1={y(v)} x2={W - PADR} y2={y(v)} stroke="var(--border)" strokeWidth={1} opacity={0.6} />
            <text x={W - PADR + 6} y={y(v) + 3} textAnchor="start" fontSize={10} fill="var(--muted)">{fmt(v)}</text>
          </g>
        ))}
        {/* previous close reference */}
        {data.prevClose > 0 && (
          <line x1={PADL} y1={y(data.prevClose)} x2={W - PADR} y2={y(data.prevClose)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="4 3" opacity={0.55} />
        )}
        <path d={area} fill={stroke} opacity={0.07} />
        <path d={path} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinejoin="round" />
        {hi && (
          <g>
            <line x1={x(hover!)} y1={PADY} x2={x(hover!)} y2={H - PADY} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />
            <line x1={PADL} y1={y(hi.c)} x2={W - PADR} y2={y(hi.c)} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />
            <circle cx={x(hover!)} cy={y(hi.c)} r={3.5} fill={stroke} stroke="var(--panel)" strokeWidth={1.5} />
            <rect x={W - PADR + 1} y={y(hi.c) - 9} width={PADR - 2} height={18} rx={3} fill={stroke} />
            <text x={W - PADR / 2} y={y(hi.c) + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#fff">{fmt(hi.c)}</text>
          </g>
        )}
      </svg>

      {/* Rich OHLC/Volume tooltip box, flips side near the right edge */}
      {hi && (
        <div
          className="panel"
          style={{
            position: "absolute", top: 8, pointerEvents: "none", zIndex: 5,
            padding: "8px 10px", fontSize: 11, lineHeight: 1.5, minWidth: 152,
            boxShadow: "0 4px 16px rgba(0,0,0,0.16)",
            left: hoverFrac > 0.6 ? undefined : `calc(${(hoverFrac * (1 - (PADL + PADR) / W) + PADL / W) * 100}% + 14px)`,
            right: hoverFrac > 0.6 ? `calc(${(1 - hoverFrac) * 100}% + 70px)` : undefined,
          }}
        >
          <div className="label" style={{ marginBottom: 3 }}>{dt(hi.t, intraday)}</div>
          {[["Open", hi.o], ["High", hi.h], ["Low", hi.l], ["Close", hi.c]].map(([k, val]) => (
            <div key={k as string} className="flex justify-between gap-4">
              <span style={{ color: "var(--muted)" }}>{k}</span>
              <span className="mono font-medium">{val != null ? fmt(val as number) : "—"}</span>
            </div>
          ))}
          {hi.v != null && (
            <div className="flex justify-between gap-4">
              <span style={{ color: "var(--muted)" }}>Volume</span>
              <span className="mono font-medium">{fmtVol(hi.v)}</span>
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <span className="label" style={{ fontSize: 11 }}>
          {`${dt(pts[0].t, intraday)} – ${dt(pts[pts.length - 1].t, intraday)}`}
        </span>
        <span className="mono text-sm font-semibold" style={{ color: stroke }}>
          {fmt(last)} {data.currency}
        </span>
      </div>
    </div>
  );
}

// ── Expanded panel for one index ───────────────────────────────────────────────
function ExpandedChart({ q }: { q: Quote }) {
  const [range, setRange] = useState("1mo");
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/markets?symbol=${encodeURIComponent(q.symbol)}&range=${range}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setData(d.error ? null : d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [q.symbol, range]);

  return (
    <div className="panel p-4 mt-2 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{q.name}</span>
          <span className="mono text-sm" style={{ color: "var(--muted)" }}>{fmt(q.price)}</span>
          <span className="mono text-xs font-semibold" style={{ color: q.up ? "var(--up)" : "var(--down)" }}>
            {q.up ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)} className="chip"
              style={range === r.id ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {loading && !data ? <p className="label py-8 text-center">Loading chart…</p>
        : data ? <PriceChart data={data} />
        : <p className="label py-8 text-center">Chart unavailable.</p>}
    </div>
  );
}

export default function MarketsSnapshot() {
  const [data, setData] = useState<Quote[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/markets")
        .then((r) => r.json())
        .then((d) => { if (alive && Array.isArray(d)) setData(d); })
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (!data || data.length === 0) return null;
  const open = data.find((q) => q.name === expanded);

  return (
    <div className="space-y-1">
      <div className="flex items-stretch gap-2 overflow-x-auto no-scrollbar py-1">
        {data.map((q) => (
          <button
            key={q.name}
            onClick={() => setExpanded(expanded === q.name ? null : q.name)}
            className="panel panel-hover shrink-0 px-3 py-2 flex items-center gap-2 whitespace-nowrap"
            style={expanded === q.name ? { borderColor: "var(--accent)" } : {}}
          >
            <span className="font-semibold text-sm">{q.name}</span>
            <span className="mono text-xs" style={{ color: "var(--muted)" }}>{fmt(q.price)}</span>
            <span className="mono text-xs font-semibold" style={{ color: q.up ? "var(--up)" : "var(--down)" }}>
              {q.up ? "▲" : "▼"} {Math.abs(q.changePct).toFixed(2)}%
            </span>
            <span className="label" style={{ fontSize: 10, opacity: 0.6 }}>{expanded === q.name ? "▲" : "▼"}</span>
          </button>
        ))}
      </div>
      {open && <ExpandedChart q={open} />}
    </div>
  );
}

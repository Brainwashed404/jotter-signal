import Link from "next/link";
import type { ThemeHeatmap as HM } from "@/lib/data";

const ACCENT = "227,187,78"; // brand gold, as rgb for variable-opacity cells

// Themes (rows) × months (columns); cell shade = that month's share of all signals.
// A momentum read on the right shows what's accelerating vs cooling across every source.
export default function ThemeHeatmap({ data }: { data: HM }) {
  const { monthLabels, rows, maxPct } = data;
  const n = monthLabels.length;
  const cols = `minmax(140px,1.4fr) repeat(${n}, 1fr) 60px`;
  const mom = (m: number) => (m > 4 ? "var(--up)" : m < -4 ? "var(--down, #d98a6a)" : "var(--muted)");

  return (
    <div className="panel p-4 overflow-x-auto">
      <div className="min-w-[680px]">
        {/* month header */}
        <div className="grid items-end gap-1 mb-1.5" style={{ gridTemplateColumns: cols }}>
          <div />
          {monthLabels.map((m, i) => (
            <div key={i} className="label text-center" style={{ fontSize: 9, letterSpacing: 0 }}>
              {i % 2 === 0 || i === n - 1 ? m : ""}
            </div>
          ))}
          <div className="label text-right" style={{ fontSize: 9, letterSpacing: 0 }}>trend</div>
        </div>

        {rows.map((r) => (
          <div key={r.theme} className="grid items-center gap-1 py-[3px]" style={{ gridTemplateColumns: cols }}>
            <Link
              href={`/search?theme=${encodeURIComponent(r.theme)}`}
              className="text-xs truncate pr-2 hover:underline"
              style={{ color: "var(--text)" }}
              title={`${r.theme} — search this theme`}
            >
              {r.theme}
            </Link>
            {r.pct.map((p, i) => (
              <div
                key={i}
                title={`${r.theme} · ${monthLabels[i]}: ${p}% of signals`}
                className="h-5 rounded-sm"
                style={{ background: p > 0 ? `rgba(${ACCENT},${(0.1 + 0.9 * (p / maxPct)).toFixed(3)})` : "var(--panel-2)" }}
              />
            ))}
            <div className="mono text-[11px] text-right" style={{ color: mom(r.momentum) }}>
              {r.momentum > 4 ? "▲" : r.momentum < -4 ? "▼" : "→"} {r.momentum > 0 ? "+" : ""}{r.momentum}%
            </div>
          </div>
        ))}

        <div className="label mt-3" style={{ textTransform: "none", letterSpacing: 0 }}>
          Cell shade = that theme&apos;s share of all signals that month · trend = recent vs earlier half of the window.
          Click a theme to search it.
        </div>
      </div>
    </div>
  );
}

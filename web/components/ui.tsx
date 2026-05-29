import type { ThemeSummary } from "@/lib/types";

export function Sparkline({ series, years }: { series: Record<string, number>; years: string[] }) {
  const vals = years.map((y) => series[y] ?? 0);
  const max = Math.max(1, ...vals);
  const w = 120, h = 30;
  const pts = vals
    .map((v, i) => `${(i / (vals.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx={w} cy={h - (vals[vals.length - 1] / max) * h} r="2.5" fill="var(--accent)" />
    </svg>
  );
}

export function ThemeRow({ t, years }: { t: ThemeSummary; years: string[] }) {
  const up = t.delta >= 0;
  return (
    <div className="panel panel-hover p-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="font-medium truncate">{t.theme}</div>
        <div className="label mt-1">
          {t.current}% of posts now ·{" "}
          <span style={{ color: up ? "var(--up)" : "var(--down)" }}>
            {up ? "▲" : "▼"} {Math.abs(t.delta)}pts vs 2017–20
          </span>
        </div>
      </div>
      <Sparkline series={t.series} years={years} />
    </div>
  );
}

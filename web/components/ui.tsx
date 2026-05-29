import type { Signal, ThemeSummary } from "@/lib/data";

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
      <circle
        cx={w}
        cy={h - (vals[vals.length - 1] / max) * h}
        r="2.5"
        fill="var(--accent)"
      />
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

const TYPE_LABEL: Record<string, string> = {
  longread: "Long Read",
  quote: "Quote",
  book: "Book",
  commonplace: "Commonplace",
  linkblog: "Linkblog",
  music: "Music",
  chart: "Chart",
  feedback: "Feedback",
  note: "Note",
};

export function SignalCard({ s }: { s: Signal }) {
  return (
    <div className="panel panel-hover p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="chip" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
          {TYPE_LABEL[s.type] ?? s.type}
        </span>
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>
          {s.date.slice(0, 10)}
        </span>
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>· {s.source}</span>
      </div>
      <div className="font-medium leading-snug mb-1">{s.heading}</div>
      <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
        {s.text.slice(0, 320)}
        {s.text.length > 320 ? "…" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {s.themes.slice(0, 3).map((th) => (
          <span key={th} className="chip">{th}</span>
        ))}
        {s.links.slice(0, 2).map((l, i) => (
          <a
            key={i}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            className="chip"
            style={{ color: "var(--accent-2)" }}
          >
            ↗ {l.domain}
          </a>
        ))}
        <a
          href={s.post_url}
          target="_blank"
          rel="noopener noreferrer"
          className="chip ml-auto"
        >
          source post
        </a>
      </div>
    </div>
  );
}

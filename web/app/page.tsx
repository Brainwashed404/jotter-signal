import Link from "next/link";
import { getOverview, weeklyBriefing } from "@/lib/data";
import { fmtDate } from "@/lib/format";

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

export default function HomePage() {
  const o = getOverview();
  const b = weeklyBriefing(7);

  const rising = b.themes.filter((t) => t.n >= 3 && t.delta > 0.3).sort((a, b) => b.delta - a.delta).slice(0, 6);
  const cooling = b.themes.filter((t) => t.delta < -0.3).sort((a, b) => a.delta - b.delta).slice(0, 4);
  const convergence = b.themes.filter((t) => t.experts >= 2).sort((a, b) => b.experts - a.experts).slice(0, 6);
  const topThemes = b.themes.slice(0, 3).map((t) => t.theme);

  return (
    <div className="space-y-10">
      <section>
        <div className="label">Briefing · past {b.days} days · {fmtDate(b.from)} – {fmtDate(b.to)}</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">What your experts are signalling</h1>
        <p className="mt-2 max-w-3xl leading-relaxed" style={{ color: "var(--muted)" }}>
          <span style={{ color: "var(--text)" }}>{b.count.toLocaleString()} signals</span> from{" "}
          <span style={{ color: "var(--text)" }}>{b.expertCount}</span> of {o.experts.length} experts this week.
          {topThemes.length > 0 && <> The conversation centred on <span style={{ color: "var(--accent)" }}>{list(topThemes)}</span>.</>}
          {rising.length > 0 && <> {rising.length} theme{rising.length > 1 ? "s are" : " is"} accelerating.</>}
        </p>
      </section>

      {/* What's moving — behaviour change vs the prior 4 weeks */}
      <section>
        <h2 className="text-lg font-medium mb-1">What&apos;s moving</h2>
        <p className="label mb-3" style={{ textTransform: "none", letterSpacing: 0 }}>
          Change in share of the conversation vs the previous 4 weeks
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="panel p-4">
            <div className="label mb-3" style={{ color: "var(--up)" }}>▲ Accelerating</div>
            {rising.length === 0 ? <div className="label">No clear risers this week.</div> : (
              <ul className="space-y-2">
                {rising.map((t) => (
                  <li key={t.theme} className="flex items-center justify-between gap-3">
                    <Link href={`/search?theme=${encodeURIComponent(t.theme)}`} className="text-sm hover:underline">{t.theme}</Link>
                    <span className="mono text-xs" style={{ color: "var(--up)" }}>+{t.delta} pts · {t.experts} expert{t.experts > 1 ? "s" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="panel p-4">
            <div className="label mb-3" style={{ color: "var(--down)" }}>▼ Cooling</div>
            {cooling.length === 0 ? <div className="label">Nothing notably fading.</div> : (
              <ul className="space-y-2">
                {cooling.map((t) => (
                  <li key={t.theme} className="flex items-center justify-between gap-3">
                    <Link href={`/search?theme=${encodeURIComponent(t.theme)}`} className="text-sm hover:underline">{t.theme}</Link>
                    <span className="mono text-xs" style={{ color: "var(--down)" }}>{t.delta} pts</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Convergence — what multiple independent experts are flagging */}
      {convergence.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-1">Where experts converge</h2>
          <p className="label mb-3" style={{ textTransform: "none", letterSpacing: 0 }}>
            Themes independently flagged by the most experts — the strongest signal
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {convergence.map((t) => (
              <Link key={t.theme} href={`/search?theme=${encodeURIComponent(t.theme)}`} className="panel panel-hover p-4 block">
                <div className="flex items-baseline justify-between">
                  <span className="font-medium text-sm">{t.theme}</span>
                  <span className="text-lg font-semibold" style={{ color: "var(--accent)" }}>{t.experts}</span>
                </div>
                <div className="label mt-1">experts · {t.n} signals</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Notable stats & claims pulled from the actual articles */}
      {b.stats.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-1">Notable stats &amp; claims</h2>
          <p className="label mb-3" style={{ textTransform: "none", letterSpacing: 0 }}>
            Pulled from this week&apos;s articles
          </p>
          <div className="space-y-3">
            {b.stats.slice(0, 8).map((s, i) => (
              <div key={i} className="panel p-4">
                <p className="text-sm leading-relaxed">{s.text}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Link href={`/sources/${s.sourceId}`} className="label hover:underline">{s.source}</Link>
                  <span className="label">·</span>
                  <a href={s.post_url} target="_blank" rel="noopener" className="label hover:underline" style={{ color: "var(--accent-2)" }}>
                    {s.heading.slice(0, 60)}
                  </a>
                  <span className="label ml-auto mono">{fmtDate(s.date)}</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="text-center pt-2">
        <Link href="/latest" className="btn-ghost text-sm">Browse the full feed →</Link>
      </div>
    </div>
  );
}

import { getRadar, recentSignals } from "@/lib/data";
import { ThemeRow, SignalCard } from "@/components/ui";

export default function RadarPage() {
  const r = getRadar();
  const longreads = recentSignals("longread", 6);

  return (
    <div className="space-y-10">
      <section>
        <div className="label">Foresight Radar</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">
          What the signal is saying
        </h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Themes ranked by current prevalence across {r.totals.posts.toLocaleString()} posts,
          with momentum vs the 2017–20 baseline. One sensor active:{" "}
          <span style={{ color: "var(--text)" }}>John Naughton — Memex 1.1</span>.
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Theme momentum</h2>
          <span className="label">{r.themes.length} themes tracked</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          {r.themes.map((t) => (
            <ThemeRow key={t.theme} t={t} years={r.years} />
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-medium">Latest Long Reads</h2>
          <a href="/search?type=longread" className="label hover:underline">view all →</a>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {longreads.map((s) => (
            <SignalCard key={s.id} s={s} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Information diet — how the sources shifted</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="panel p-4">
            <div className="label mb-3">Most-linked now (2020–26)</div>
            <ol className="space-y-1.5">
              {r.top_sources_recent.slice(0, 10).map((d, i) => (
                <li key={d.domain} className="flex justify-between text-sm">
                  <span><span className="mono" style={{ color: "var(--muted)" }}>{i + 1}.</span> {d.domain}</span>
                  <span className="mono" style={{ color: "var(--muted)" }}>{d.n}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="panel p-4">
            <div className="label mb-3">Most-linked early (2002–10)</div>
            <ol className="space-y-1.5">
              {r.top_sources_early.slice(0, 10).map((d, i) => (
                <li key={d.domain} className="flex justify-between text-sm">
                  <span><span className="mono" style={{ color: "var(--muted)" }}>{i + 1}.</span> {d.domain}</span>
                  <span className="mono" style={{ color: "var(--muted)" }}>{d.n}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

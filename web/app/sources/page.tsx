import { getRadar } from "@/lib/data";

const TYPE_LABEL: Record<string, string> = {
  longread: "Long Reads", quote: "Quotes", book: "Books", commonplace: "Commonplace",
  linkblog: "Linkblog", music: "Music", chart: "Charts", feedback: "Feedback", note: "Notes",
};

const PLANNED = [
  "Cory Doctorow — Pluralistic",
  "Azeem Azhar — Exponential View",
  "Benedict Evans",
  "Ezra Klein",
  "Add an RSS feed…",
];

export default function SourcesPage() {
  const r = getRadar();
  const types = Object.entries(r.signal_types).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-8">
      <div>
        <div className="label">Sensors</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Your curated minds</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Each sensor is a trusted thinker whose stream is atomised into signals. Foresight gets
          sharper as you add sensors — corroboration across independent minds is the strongest signal.
        </p>
      </div>

      <div className="panel p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="chip" style={{ color: "var(--up)", borderColor: "var(--up)" }}>● active</span>
              <h2 className="text-xl font-semibold">John Naughton</h2>
            </div>
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              Memex 1.1 · Observer columnist & Cambridge tech-society academic ·{" "}
              <a href="https://memex.naughtons.org" target="_blank" rel="noopener" style={{ color: "var(--accent-2)" }}>
                memex.naughtons.org
              </a>
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold">{r.totals.signals.toLocaleString()}</div>
            <div className="label">signals</div>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-5">
          {types.map(([t, n]) => (
            <div key={t} className="panel p-3 text-center">
              <div className="text-lg font-semibold">{n.toLocaleString()}</div>
              <div className="label">{TYPE_LABEL[t] ?? t}</div>
            </div>
          ))}
        </div>
        <div className="label mt-4">
          {r.totals.date_min} → {r.totals.date_max} · refreshed on demand (live ingestion coming)
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Planned sensors</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {PLANNED.map((p) => (
            <div key={p} className="panel p-4 flex items-center justify-between" style={{ opacity: 0.7 }}>
              <span>{p}</span>
              <span className="chip">queued</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

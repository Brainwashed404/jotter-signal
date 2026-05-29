import Link from "next/link";
import { getRadar } from "@/lib/data";

const PLANNED = [
  "Cory Doctorow — Pluralistic",
  "Azeem Azhar — Exponential View",
  "Benedict Evans",
  "Ezra Klein",
  "Add an RSS feed…",
];

export default function SourcesPage() {
  const r = getRadar();
  return (
    <div className="space-y-8">
      <div>
        <div className="label">Experts</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Your curated minds</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Each expert is a trusted thinker whose stream is atomised into signals. Click in to see
          how they&apos;ve covered themes across their writing life, and their information diet.
        </p>
      </div>

      <Link href="/sources/naughton" className="panel panel-hover p-6 block">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="chip" style={{ color: "var(--up)", borderColor: "var(--up)" }}>● active</span>
              <h2 className="text-xl font-semibold">John Naughton</h2>
            </div>
            <p className="mt-1" style={{ color: "var(--muted)" }}>
              Memex 1.1 · Observer columnist & Cambridge tech-society academic
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold">{r.totals.signals.toLocaleString()}</div>
            <div className="label">signals · view profile →</div>
          </div>
        </div>
      </Link>

      <div>
        <h2 className="text-lg font-medium mb-3">Planned experts</h2>
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

import Link from "next/link";
import { getExperts } from "@/lib/data";
import { fmtDate } from "@/lib/format";

export default function SourcesPage() {
  const experts = getExperts();
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

      <div className="space-y-3">
        {experts.map((e) => (
          <Link key={e.id} href={`/sources/${e.id}`} className="panel panel-hover p-6 block">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="chip" style={{ color: "var(--up)", borderColor: "var(--up)" }}>● active</span>
                  <h2 className="text-xl font-semibold">{e.name}</h2>
                </div>
                <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{e.blurb}</p>
                <div className="label mt-2">{fmtDate(e.totals.date_min)} → {fmtDate(e.totals.date_max)}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-semibold">{e.totals.signals.toLocaleString()}</div>
                <div className="label">signals · view →</div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <p className="label">
        Add an expert: drop their RSS/Substack feed into <span className="mono">engine/experts.json</span> and run the ingest.
      </p>
    </div>
  );
}

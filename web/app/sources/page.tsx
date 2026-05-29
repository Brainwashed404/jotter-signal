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
          how they&apos;ve covered the themes across their writing life.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {experts.map((e) => (
          <Link key={e.id} href={`/sources/${e.id}`} className="panel panel-hover p-4 flex flex-col">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold leading-tight">{e.name}</h2>
              <span className="text-lg font-semibold shrink-0" style={{ color: "var(--accent)" }}>
                {e.totals.signals.toLocaleString()}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-snug flex-1" style={{ color: "var(--muted)" }}>
              {e.blurb.length > 110 ? e.blurb.slice(0, 110) + "…" : e.blurb}
            </p>
            <div className="label mt-2.5">{fmtDate(e.totals.date_min)} → {fmtDate(e.totals.date_max)}</div>
          </Link>
        ))}
      </div>

      <p className="label">
        Add an expert: drop their RSS/Substack feed into <span className="mono">engine/experts.json</span> and run the ingest.
      </p>
    </div>
  );
}

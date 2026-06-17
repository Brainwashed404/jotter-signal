import Link from "next/link";
import { notFound } from "next/navigation";
import { loadData, getExpert } from "@/lib/data";
import { listUploads } from "@/lib/uploads";
import SignalList, { type Tab } from "@/components/SignalList";
import ExpertAdmin from "@/components/ExpertAdmin";
import { TYPE_LABEL, KIND_LABEL } from "@/lib/types";
import { fmtDate } from "@/lib/format";

// Shared profile body for /sources/[id] (authors) and /publications/[id].
// backHref/backLabel keep the breadcrumb + nav highlight correct for each section.
export default async function SourceProfile({
  id, backHref, backLabel,
}: { id: string; backHref: string; backLabel: string }) {
  await loadData();
  const r = getExpert(id);
  if (!r) notFound();

  // Naughton has rich section-level types; everyone else uses universal kinds.
  const useTypes = Object.keys(r.signal_types).filter((t) => t !== "article").length > 1;
  const tabs: Tab[] = useTypes
    ? [{ id: "", label: "All" },
       ...Object.entries(r.signal_types).sort((a, b) => b[1] - a[1])
         .map(([t]) => ({ id: t, label: TYPE_LABEL[t] ?? t }))]
    : [{ id: "", label: "All" },
       ...Object.entries(r.signal_kinds).sort((a, b) => b[1] - a[1])
         .filter(([, n]) => n > 0)
         .map(([k]) => ({ id: k, label: KIND_LABEL[k] ?? k }))];
  const filterBy = useTypes ? "type" as const : "kind" as const;
  const years = r.years.map(Number).sort((a, b) => b - a);

  return (
    <div className="space-y-10">
      <div>
        <Link href={backHref} className="label hover:underline">← {backLabel}</Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{r.name}</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>{r.blurb}</p>
        <div className="flex items-center gap-3 mt-2">
          {r.url && (
            <a href={r.url} target="_blank" rel="noopener" className="text-sm" style={{ color: "var(--accent-2)" }}>
              {r.url.replace(/^https?:\/\//, "")} ↗︎
            </a>
          )}
          <span className="label">
            {r.totals.signals.toLocaleString()} signals · {fmtDate(r.totals.date_min)} → {fmtDate(r.totals.date_max)}
          </span>
        </div>
      </div>

      {r.uploaded && (
        <ExpertAdmin expertId={r.id} uploads={listUploads(r.id)} name={r.name} blurb={r.blurb} editable={!!r.uploaded} />
      )}

      <section>
        <h2 className="text-lg font-medium mb-3">Full feed</h2>
        <SignalList
          tabs={tabs}
          filterBy={filterBy}
          initialExperts={[r.id]}
          showSort
          showYears
          availableYears={years}
          showThemes
          themes={r.themes.map((t) => t.theme)}
        />
      </section>
    </div>
  );
}

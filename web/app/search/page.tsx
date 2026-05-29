import { getOverview } from "@/lib/data";
import SignalList, { type Tab } from "@/components/SignalList";

const TABS: Tab[] = [
  { id: "", label: "All" },
  { id: "article", label: "Articles" },
  { id: "longread", label: "Long Reads" },
  { id: "quote", label: "Quotes" },
  { id: "commonplace", label: "Commonplace" },
  { id: "book", label: "Books" },
  { id: "linkblog", label: "Linkblog" },
  { id: "chart", label: "Charts" },
  { id: "note", label: "Notes" },
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; theme?: string; experts?: string }>;
}) {
  const sp = await searchParams;
  const o = getOverview();
  const years = o.years.map(Number).sort((a, b) => b - a); // newest first
  return (
    <div className="space-y-6">
      <div>
        <div className="label">Search</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Interrogate the signal</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Search every atom your experts have surfaced. Filter by expert, type, theme or year, and
          sort by date. Each result is cited back to the original post.
        </p>
      </div>
      <SignalList
        tabs={TABS}
        themes={o.themeNames}
        availableYears={years}
        availableExperts={o.experts}
        showSearch
        showThemes
        showSort
        showYears
        showExperts
        initialQuery={sp.q ?? ""}
        initialType={sp.type ?? ""}
        initialTheme={sp.theme ?? ""}
        initialExperts={sp.experts ? sp.experts.split(",").filter(Boolean) : []}
      />
    </div>
  );
}

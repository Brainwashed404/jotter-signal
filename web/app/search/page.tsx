import { getRadar } from "@/lib/data";
import SignalList, { type Tab } from "@/components/SignalList";

const TABS: Tab[] = [
  { id: "", label: "All" },
  { id: "longread", label: "Long Reads" },
  { id: "quote", label: "Quotes" },
  { id: "commonplace", label: "Commonplace" },
  { id: "book", label: "Books" },
  { id: "linkblog", label: "Linkblog" },
  { id: "chart", label: "Charts" },
  { id: "note", label: "Notes" },
  { id: "feedback", label: "Feedback" },
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; theme?: string }>;
}) {
  const sp = await searchParams;
  const radar = getRadar();
  const themes = radar.themes.map((t) => t.theme);
  const years = radar.years.map(Number).sort((a, b) => b - a); // newest first
  return (
    <div className="space-y-6">
      <div>
        <div className="label">Search</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Interrogate the signal</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Search every atom your experts have surfaced. Filter by type, theme or year, and sort by
          date. Each result is cited back to the original post.
        </p>
      </div>
      <SignalList
        tabs={TABS}
        themes={themes}
        availableYears={years}
        showSearch
        showThemes
        showSort
        showYears
        initialQuery={sp.q ?? ""}
        initialType={sp.type ?? ""}
        initialTheme={sp.theme ?? ""}
      />
    </div>
  );
}

import { getRadar } from "@/lib/data";
import SignalList, { type Tab } from "@/components/SignalList";

const TABS: Tab[] = [
  { id: "", label: "All" },
  { id: "longread", label: "Long Reads" },
  { id: "quote", label: "Quotes" },
  { id: "commonplace", label: "Commonplace" },
  { id: "book", label: "Books" },
  { id: "linkblog", label: "Linkblog" },
  { id: "note", label: "Notes" },
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const themes = getRadar().themes.map((t) => t.theme);
  return (
    <div className="space-y-6">
      <div>
        <div className="label">Workbench</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Interrogate the signal</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Search every atom your sensors have surfaced. Filter by type or theme. Each result is
          cited back to the original post.
        </p>
      </div>
      <SignalList
        tabs={TABS}
        themes={themes}
        showSearch
        showThemes
        initialQuery={sp.q ?? ""}
        initialType={sp.type ?? ""}
      />
    </div>
  );
}

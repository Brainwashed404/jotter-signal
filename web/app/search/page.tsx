import { loadData, getOverview, suggestedSearches } from "@/lib/data";
import SignalList, { type Tab } from "@/components/SignalList";

const TABS: Tab[] = [
  { id: "",         label: "Everything" },
  { id: "longread", label: "Long Reads"  },
  { id: "article",  label: "Articles"   },
  { id: "qanda",    label: "Q&A"        },
  { id: "links",    label: "Links"      },
  { id: "data",     label: "Data"       },
];

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; theme?: string; experts?: string }>;
}) {
  const sp = await searchParams;
  await loadData();
  const o = getOverview();
  const years = o.years.map(Number).sort((a, b) => b - a); // newest first
  const searchSuggestions = suggestedSearches();
  return (
    <div className="space-y-6">
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
        searchSuggestions={searchSuggestions}
        initialQuery={sp.q ?? ""}
        initialType={sp.type ?? ""}
        initialTheme={sp.theme ?? ""}
        initialExperts={sp.experts ? sp.experts.split(",").filter(Boolean) : []}
      />
    </div>
  );
}

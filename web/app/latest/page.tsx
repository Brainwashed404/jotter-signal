import { getRadar } from "@/lib/data";
import SignalList, { type Tab } from "@/components/SignalList";

const TABS: Tab[] = [
  { id: "", label: "Everything" },
  { id: "longread", label: "Long Reads" },
  { id: "commonplace", label: "Commonplace" },
  { id: "quote", label: "Quotes" },
  { id: "book", label: "Books" },
  { id: "linkblog", label: "Linkblog" },
];

export default function LatestPage() {
  const r = getRadar();
  return (
    <div className="space-y-6">
      <div>
        <div className="label">Latest</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">The full feed</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Everything your experts have surfaced, newest first. Read in full, pin with ★, or
          highlight a passage to save it.
        </p>
      </div>
      <SignalList tabs={TABS} showSort={false} />
      <p className="label text-center pt-2">
        {r.totals.signals.toLocaleString()} signals total · search the full archive under Search
      </p>
    </div>
  );
}

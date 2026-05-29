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

export default function HomePage() {
  const r = getRadar();

  return (
    <div className="space-y-8">
      <section>
        <div className="label">Latest signal</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">What he's surfacing</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          The most recent things your sensors flagged — read in full, right here, and scroll back
          through the whole archive. Pin anything worth keeping with ★. Currently 1 sensor:{" "}
          <a href="/sources/naughton" className="hover:underline" style={{ color: "var(--accent-2)" }}>
            John Naughton
          </a>
          .
        </p>
      </section>
      <SignalList tabs={TABS} showSort={false} />
      <p className="label text-center pt-2">
        {r.totals.signals.toLocaleString()} signals total · search everything in the Workbench
      </p>
    </div>
  );
}

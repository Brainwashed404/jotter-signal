import { getRadar, latestFeed } from "@/lib/data";
import Feed from "@/components/Feed";

export default function HomePage() {
  const r = getRadar();
  const signals = latestFeed({ limit: 80 });

  return (
    <div className="space-y-8">
      <section>
        <div className="label">Latest signal</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">What he's surfacing</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          The most recent things your sensors flagged — read in full, right here. Pin anything worth
          keeping with ★. Currently 1 sensor:{" "}
          <a href="/sources/naughton" className="hover:underline" style={{ color: "var(--accent-2)" }}>
            John Naughton
          </a>
          .
        </p>
      </section>
      <Feed signals={signals} />
      <p className="label text-center pt-2">
        Showing the latest of {r.totals.signals.toLocaleString()} signals · search everything in the Workbench
      </p>
    </div>
  );
}

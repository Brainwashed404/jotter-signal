import { getRadar, weeklySummary } from "@/lib/data";
import SignalList, { type Tab } from "@/components/SignalList";

const TABS: Tab[] = [
  { id: "", label: "Everything" },
  { id: "longread", label: "Long Reads" },
  { id: "commonplace", label: "Commonplace" },
  { id: "quote", label: "Quotes" },
  { id: "book", label: "Books" },
  { id: "linkblog", label: "Linkblog" },
];

function fmt(d: string, withYear = false) {
  return new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: withYear ? "numeric" : undefined,
    timeZone: "UTC",
  });
}

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

export default function HomePage() {
  const r = getRadar();
  const s = weeklySummary(7);
  const topThemes = s.themes.slice(0, 3).map((t) => t.theme);

  return (
    <div className="space-y-8">
      <section>
        <div className="label">Latest signals</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Summary</h1>

        <div className="panel p-5 mt-3 space-y-4">
          <div className="label">
            Past {s.days} days · {fmt(s.from)} – {fmt(s.to, true)} · {s.count} signals
          </div>

          {s.count === 0 ? (
            <p style={{ color: "var(--muted)" }}>No signals in the past {s.days} days.</p>
          ) : (
            <>
              <p className="leading-relaxed">
                Over the past {s.days} days, your experts surfaced{" "}
                <strong>{s.count} signals</strong>
                {topThemes.length > 0 && (
                  <>
                    , with attention centring on{" "}
                    <strong style={{ color: "var(--accent)" }}>{list(topThemes)}</strong>
                  </>
                )}
                .
                {s.longreads.length > 0 && (
                  <> {s.longreads.length} long read{s.longreads.length > 1 ? "s" : ""} stood out (below).</>
                )}
              </p>

              {s.themes.length > 0 && (
                <div>
                  <div className="label mb-2">Key themes this week</div>
                  <div className="flex flex-wrap gap-1.5">
                    {s.themes.slice(0, 8).map((t) => (
                      <a
                        key={t.theme}
                        href={`/search?theme=${encodeURIComponent(t.theme)}`}
                        className="chip"
                      >
                        {t.theme} · {t.n}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {s.longreads.length > 0 && (
                <div>
                  <div className="label mb-2">Developments — this week&apos;s long reads</div>
                  <ul className="space-y-1.5">
                    {s.longreads.slice(0, 8).map((l, i) => (
                      <li key={i} className="text-sm flex gap-2">
                        <span className="mono" style={{ color: "var(--muted)" }}>{fmt(l.date)}</span>
                        <a href={l.post_url} target="_blank" rel="noopener" className="hover:underline">
                          {l.heading}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Latest signals</h2>
        <SignalList tabs={TABS} showSort={false} />
      </section>

      <p className="label text-center pt-2">
        {r.totals.signals.toLocaleString()} signals total · search the full archive under Search
      </p>
    </div>
  );
}

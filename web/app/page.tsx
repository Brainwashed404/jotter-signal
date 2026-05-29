import Link from "next/link";
import { getOverview, weeklySummary } from "@/lib/data";
import { fmtDate } from "@/lib/format";

function list(items: string[]) {
  if (items.length <= 1) return items.join("");
  return items.slice(0, -1).join(", ") + " and " + items[items.length - 1];
}

function Stat({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="panel p-3 text-center">
      <div className="text-xl font-semibold">{n}</div>
      <div className="label">{label}</div>
    </div>
  );
}

export default function HomePage() {
  const o = getOverview();
  const s = weeklySummary(7);
  const topThemes = s.themes.slice(0, 3).map((t) => t.theme);
  const quote = s.quotes[0];

  return (
    <div className="space-y-8">
      <section>
        <div className="label">Past {s.days} days · {fmtDate(s.from)} – {fmtDate(s.to)}</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Your briefing</h1>
        {s.count > 0 && (
          <p className="mt-2 max-w-3xl leading-relaxed">
            Your experts surfaced <strong>{s.count} signals</strong> this week
            {topThemes.length > 0 && (
              <>, with attention centring on{" "}
                <strong style={{ color: "var(--accent)" }}>{list(topThemes)}</strong></>
            )}
            .
          </p>
        )}
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat n={s.count} label="signals this week" />
        <Stat n={s.themes.length} label="themes touched" />
        <Stat n={s.longreads.length} label="long reads" />
        <Stat n={o.signals.toLocaleString()} label="signals in archive" />
      </section>

      {s.themes.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Key themes this week</h2>
          <div className="flex flex-wrap gap-1.5">
            {s.themes.slice(0, 10).map((t) => (
              <Link key={t.theme} href={`/search?theme=${encodeURIComponent(t.theme)}`} className="chip">
                {t.theme} · {t.n}
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {s.longreads.length > 0 && (
          <section className="panel p-5">
            <h2 className="text-lg font-medium mb-3">Developments — long reads</h2>
            <ul className="space-y-2.5">
              {s.longreads.slice(0, 6).map((l, i) => (
                <li key={i} className="text-sm">
                  <a href={l.post_url} target="_blank" rel="noopener" className="hover:underline font-medium">{l.heading}</a>
                  <span className="mono ml-2" style={{ color: "var(--muted)" }}>{fmtDate(l.date)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="space-y-6">
          {quote && (
            <section className="panel p-5">
              <h2 className="text-lg font-medium mb-3">Quote of the week</h2>
              <blockquote className="border-l-2 pl-3 text-sm leading-relaxed" style={{ borderColor: "var(--accent)" }}>
                {quote.text.slice(0, 400)}
              </blockquote>
            </section>
          )}

          {s.domains.length > 0 && (
            <section className="panel p-5">
              <h2 className="text-lg font-medium mb-3">Further reading — most-cited sources</h2>
              <ul className="space-y-1.5">
                {s.domains.slice(0, 8).map((d) => (
                  <li key={d.domain} className="flex justify-between text-sm">
                    <a href={d.url} target="_blank" rel="noopener" className="hover:underline" style={{ color: "var(--accent-2)" }}>
                      {d.domain}
                    </a>
                    <span className="mono" style={{ color: "var(--muted)" }}>{d.n}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {s.books.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Books flagged this week</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {s.books.slice(0, 4).map((b, i) => (
              <a key={i} href={b.post_url} target="_blank" rel="noopener" className="panel panel-hover p-4 block">
                <div className="font-medium text-sm">{b.heading}</div>
                <div className="label mt-1">{fmtDate(b.date)}</div>
              </a>
            ))}
          </div>
        </section>
      )}

      <div className="text-center pt-2">
        <Link href="/latest" className="btn-ghost text-sm">See all latest signals →</Link>
      </div>
    </div>
  );
}

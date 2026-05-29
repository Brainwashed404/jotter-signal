import Link from "next/link";
import { notFound } from "next/navigation";
import { getRadar } from "@/lib/data";
import { ThemeRow } from "@/components/ui";
import { TYPE_LABEL } from "@/lib/types";

const AUTHORS: Record<string, { name: string; blurb: string; url: string }> = {
  naughton: {
    name: "John Naughton",
    blurb:
      "Observer columnist and Cambridge academic (technology & society). Techno-skeptical, pro-democracy, historically minded. His daily 'commonplace book' has run since 2002.",
    url: "https://memex.naughtons.org",
  },
};

export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const author = AUTHORS[id];
  if (!author) notFound();

  const r = getRadar();
  const types = Object.entries(r.signal_types).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/sources" className="label hover:underline">← all experts</Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{author.name}</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>{author.blurb}</p>
        <a href={author.url} target="_blank" rel="noopener" className="text-sm" style={{ color: "var(--accent-2)" }}>
          {author.url.replace("https://", "")} ↗
        </a>
      </div>

      <section>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="panel p-3 text-center">
            <div className="text-lg font-semibold">{r.totals.posts.toLocaleString()}</div>
            <div className="label">posts</div>
          </div>
          {types.map(([t, n]) => (
            <div key={t} className="panel p-3 text-center">
              <div className="text-lg font-semibold">{n.toLocaleString()}</div>
              <div className="label">{TYPE_LABEL[t] ?? t}</div>
            </div>
          ))}
        </div>
        <div className="label mt-3">{r.totals.date_min} → {r.totals.date_max}</div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-1">How they&apos;ve covered the themes</h2>
        <p className="label mb-3" style={{ textTransform: "none", letterSpacing: 0 }}>
          % of posts touching each theme, by year · momentum vs the 2017–20 baseline
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {r.themes.map((t) => (
            <ThemeRow key={t.theme} t={t} years={r.years} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Information diet — how the sources shifted</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="panel p-4">
            <div className="label mb-3">Most-linked now (2020–26)</div>
            <ol className="space-y-1.5">
              {r.top_sources_recent.slice(0, 12).map((d, i) => (
                <li key={d.domain} className="flex justify-between text-sm">
                  <span><span className="mono" style={{ color: "var(--muted)" }}>{i + 1}.</span> {d.domain}</span>
                  <span className="mono" style={{ color: "var(--muted)" }}>{d.n}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="panel p-4">
            <div className="label mb-3">Most-linked early (2002–10)</div>
            <ol className="space-y-1.5">
              {r.top_sources_early.slice(0, 12).map((d, i) => (
                <li key={d.domain} className="flex justify-between text-sm">
                  <span><span className="mono" style={{ color: "var(--muted)" }}>{i + 1}.</span> {d.domain}</span>
                  <span className="mono" style={{ color: "var(--muted)" }}>{d.n}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </div>
  );
}

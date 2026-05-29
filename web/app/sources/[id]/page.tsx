import Link from "next/link";
import { notFound } from "next/navigation";
import { getExpert } from "@/lib/data";
import { ThemeRow } from "@/components/ui";
import { TYPE_LABEL } from "@/lib/types";
import { fmtDate } from "@/lib/format";

export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = getExpert(id);
  if (!r) notFound();

  const types = Object.entries(r.signal_types).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/sources" className="label hover:underline">← all experts</Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{r.name}</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>{r.blurb}</p>
        <a href={r.url} target="_blank" rel="noopener" className="text-sm" style={{ color: "var(--accent-2)" }}>
          {r.url.replace("https://", "")} ↗
        </a>
      </div>

      <section>
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          <div className="panel p-3 text-center">
            <div className="text-lg font-semibold">{r.totals.posts.toLocaleString()}</div>
            <div className="label">posts</div>
          </div>
          {types.map(([t, n]) => (
            <Link key={t} href={`/search?type=${t}&experts=${r.id}`} className="panel panel-hover p-3 text-center block">
              <div className="text-lg font-semibold">{n.toLocaleString()}</div>
              <div className="label">{TYPE_LABEL[t] ?? t}</div>
            </Link>
          ))}
        </div>
        <div className="label mt-3">{fmtDate(r.totals.date_min)} → {fmtDate(r.totals.date_max)}</div>
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
    </div>
  );
}

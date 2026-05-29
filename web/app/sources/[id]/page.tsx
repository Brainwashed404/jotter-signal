import Link from "next/link";
import { notFound } from "next/navigation";
import { getExpert } from "@/lib/data";
import { ThemeRow } from "@/components/ui";
import SignalList, { type Tab } from "@/components/SignalList";
import { TYPE_LABEL } from "@/lib/types";
import { fmtDate } from "@/lib/format";

export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const r = getExpert(id);
  if (!r) notFound();

  const types = Object.entries(r.signal_types).sort((a, b) => b[1] - a[1]);
  const tabs: Tab[] = [
    { id: "", label: "All" },
    ...types.map(([t]) => ({ id: t, label: TYPE_LABEL[t] ?? t })),
  ];
  const years = r.years.map(Number).sort((a, b) => b - a);

  return (
    <div className="space-y-10">
      <div>
        <Link href="/sources" className="label hover:underline">← all experts</Link>
        <h1 className="text-3xl font-semibold tracking-tight mt-2">{r.name}</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>{r.blurb}</p>
        <div className="flex items-center gap-3 mt-2">
          <a href={r.url} target="_blank" rel="noopener" className="text-sm" style={{ color: "var(--accent-2)" }}>
            {r.url.replace(/^https?:\/\//, "")} ↗
          </a>
          <span className="label">
            {r.totals.signals.toLocaleString()} signals · {fmtDate(r.totals.date_min)} → {fmtDate(r.totals.date_max)}
          </span>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-medium mb-1">How they&apos;ve covered the themes</h2>
        <p className="label mb-3" style={{ textTransform: "none", letterSpacing: 0 }}>
          % of posts touching each theme, by year · with momentum
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {r.themes.map((t) => (
            <ThemeRow key={t.theme} t={t} years={r.years} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Full feed</h2>
        <SignalList tabs={tabs} initialExperts={[r.id]} showSort showYears availableYears={years} />
      </section>
    </div>
  );
}

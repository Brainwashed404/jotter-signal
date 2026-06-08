"use client";
import { useState } from "react";
import Link from "next/link";
import type { Expert } from "@/lib/types";
import { fmtDate } from "@/lib/format";

type Sort = "az" | "za";

const SORTS: { value: Sort; label: string }[] = [
  { value: "az", label: "A → Z" },
  { value: "za", label: "Z → A" },
];

function sorted(experts: Expert[], sort: Sort): Expert[] {
  const a = [...experts];
  if (sort === "az") return a.sort((x, y) => x.name.localeCompare(y.name));
  return a.sort((x, y) => y.name.localeCompare(x.name));
}

export default function SourcesGrid({ experts, basePath = "/sources" }: { experts: Expert[]; basePath?: string }) {
  const [sort, setSort] = useState<Sort>("az");

  return (
    <>
      <div className="flex items-center gap-1.5 mb-5">
        <span className="label mr-1">Sort</span>
        {SORTS.map((s) => (
          <button
            key={s.value}
            onClick={() => setSort(s.value)}
            className="chip"
            style={sort === s.value ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted(experts, sort).map((e) => (
          <Link key={e.id} href={`${basePath}/${e.id}`} className="panel panel-hover p-4 flex flex-col">
            <h2 className="font-semibold leading-tight">{e.name}</h2>
            <p className="mt-1.5 text-xs leading-snug flex-1" style={{ color: "var(--muted)" }}>
              {e.blurb.length > 110 ? e.blurb.slice(0, 110) + "…" : e.blurb}
            </p>
            <div className="label mt-2.5">{fmtDate(e.totals.date_min)} → {fmtDate(e.totals.date_max)}</div>
          </Link>
        ))}
      </div>
    </>
  );
}

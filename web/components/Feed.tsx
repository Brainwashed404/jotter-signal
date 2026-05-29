"use client";
import { useState } from "react";
import type { Signal } from "@/lib/types";
import { SignalCard } from "@/components/SignalCard";

const TABS = [
  { id: "", label: "Everything" },
  { id: "longread", label: "Long Reads" },
  { id: "commonplace", label: "Commonplace" },
  { id: "quote", label: "Quotes" },
  { id: "book", label: "Books" },
  { id: "linkblog", label: "Linkblog" },
];

export default function Feed({ signals }: { signals: Signal[] }) {
  const [type, setType] = useState("");
  const shown = type ? signals.filter((s) => s.type === type) : signals;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setType(t.id)}
            className="chip"
            style={type === t.id ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {shown.slice(0, 50).map((s) => (
          <SignalCard key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}

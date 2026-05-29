"use client";
import { useState } from "react";
import Link from "next/link";
import type { Signal } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import { useSaved, toggleSave } from "@/lib/saved";

export function SignalCard({ s }: { s: Signal }) {
  const [open, setOpen] = useState(false);
  const { ids } = useSaved();
  const saved = ids.has(s.id);
  const long = s.text.length > 360;

  return (
    <div className="panel panel-hover p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="chip" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
          {TYPE_LABEL[s.type] ?? s.type}
        </span>
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>{s.date.slice(0, 10)}</span>
        <Link href={`/sources/${s.source_id}`} className="mono text-xs hover:underline" style={{ color: "var(--muted)" }}>
          · {s.source}
        </Link>
        <button
          onClick={() => toggleSave(s)}
          className="ml-auto text-lg leading-none"
          title={saved ? "Saved — click to remove" : "Save / pin"}
          style={{ color: saved ? "var(--accent)" : "var(--muted)" }}
        >
          {saved ? "★" : "☆"}
        </button>
      </div>

      <div className="font-medium leading-snug mb-1">{s.heading}</div>

      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--muted)" }}>
        {open || !long ? s.text : s.text.slice(0, 360) + "…"}
      </p>
      {long && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs mt-1.5"
          style={{ color: "var(--accent-2)" }}
        >
          {open ? "Show less ▲" : "Read full text ▼"}
        </button>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
        {s.themes.slice(0, 3).map((th) => (
          <span key={th} className="chip">{th}</span>
        ))}
        {(open ? s.links : s.links.slice(0, 2)).map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="chip" style={{ color: "var(--accent-2)" }}>
            ↗ {l.anchor ? l.anchor.slice(0, 28) : l.domain}
          </a>
        ))}
        <a href={s.post_url} target="_blank" rel="noopener noreferrer" className="chip ml-auto">
          original post
        </a>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Signal } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import { useSaved, toggleSave, addHighlight, useReport, toggleReport } from "@/lib/saved";
import { themesFor } from "@/lib/themes";
import { fmtDate } from "@/lib/format";

const LINK = /\[([^\]]+)\]\(([^)]+)\)/g;
const demd = (t: string) => t.replace(LINK, "$1");

function renderWithLinks(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0, i = 0, m: RegExpExecArray | null;
  LINK.lastIndex = 0;
  while ((m = LINK.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    nodes.push(
      <a key={i++} href={m[2]} target="_blank" rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()} className="underline" style={{ color: "var(--accent-2)" }}>
        {m[1]}
      </a>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function SignalCard({ s }: { s: Signal }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<{ text: string; top: number; left: number } | null>(null);
  const [flash, setFlash] = useState(false);
  const { ids } = useSaved();
  const { ids: reportIds } = useReport();
  const saved = ids.has(s.id);
  const inReport = reportIds.has(s.id);

  function addReport() {
    toggleReport({
      id: s.id, kind: "signal", heading: s.heading, text: s.text.slice(0, 4000),
      source: s.source, sourceId: s.source_id, date: s.date, post_url: s.post_url,
    });
  }
  const long = s.text.length > 360;
  const hasImages = !!(s.images && s.images.length);
  const expandable = long || hasImages;

  // clear the floating button when the user clicks/selects elsewhere
  useEffect(() => {
    if (!sel) return;
    const clear = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.dataset?.hlbtn === undefined) setSel(null);
    };
    document.addEventListener("mousedown", clear);
    window.addEventListener("scroll", () => setSel(null), { once: true });
    return () => document.removeEventListener("mousedown", clear);
  }, [sel]);

  function onMouseUp() {
    const s2 = window.getSelection();
    if (!s2 || s2.isCollapsed) { setSel(null); return; }
    const text = s2.toString().trim();
    if (text.length < 3) { setSel(null); return; }
    const rect = s2.getRangeAt(0).getBoundingClientRect();
    setSel({ text, top: rect.top - 6, left: rect.left + rect.width / 2 });
  }

  function saveHighlight() {
    if (!sel) return;
    addHighlight({
      signalId: s.id,
      signalHeading: s.heading,
      signalDate: s.date,
      source: s.source,
      sourceId: s.source_id,
      postUrl: s.post_url,
      text: sel.text,
      tags: themesFor(sel.text), // auto-tag by theme; blank if it's just a quip
    });
    setSel(null);
    window.getSelection()?.removeAllRanges();
    setFlash(true);
    setTimeout(() => setFlash(false), 1600);
  }

  function onCardClick(e: React.MouseEvent) {
    if (!expandable) return;
    if (window.getSelection()?.toString().trim()) return;          // mid text-selection
    if ((e.target as HTMLElement).closest("a,button,input,textarea")) return; // links/controls
    setOpen((o) => !o);
  }

  return (
    <div
      onClick={onCardClick}
      className={`panel panel-hover p-4 relative${open ? " md:col-span-2" : ""}`}
      style={{ cursor: expandable ? "pointer" : undefined }}
    >
      {flash && (
        <div className="absolute top-2 right-2 chip" style={{ color: "var(--up)", borderColor: "var(--up)" }}>
          ✓ highlight saved
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <span className="chip" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
          {TYPE_LABEL[s.type] ?? s.type}
        </span>
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>{fmtDate(s.date)}</span>
        <Link href={`/sources/${s.source_id}`} className="mono text-xs hover:underline" style={{ color: "var(--muted)" }}>
          · {s.source}
        </Link>
        <button
          onClick={addReport}
          className="ml-auto chip"
          title={inReport ? "In report — click to remove" : "Add to report"}
          style={inReport ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
        >
          {inReport ? "✓ Report" : "+ Report"}
        </button>
        <button
          onClick={() => toggleSave(s)}
          className="text-lg leading-none"
          title={saved ? "Saved — click to remove" : "Save / pin"}
          style={{ color: saved ? "var(--accent)" : "var(--muted)" }}
        >
          {saved ? "★" : "☆"}
        </button>
      </div>

      <div className="font-medium leading-snug mb-1">{s.heading}</div>

      <p
        onMouseUp={onMouseUp}
        className="text-sm leading-relaxed whitespace-pre-wrap"
        style={{ color: "var(--muted)" }}
      >
        {open || !long ? renderWithLinks(s.text) : demd(s.text).slice(0, 360) + "…"}
      </p>
      {expandable && (
        <button onClick={() => setOpen((o) => !o)} className="text-xs mt-1.5" style={{ color: "var(--accent-2)" }}>
          {open ? "Show less ▲" : long ? "Read full text ▼" : `Show image${s.images!.length > 1 ? "s" : ""} ▼`}
        </button>
      )}

      {open && s.images && s.images.length > 0 && (
        <div className="mt-3 space-y-2">
          {s.images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              loading="lazy"
              className="rounded-lg border w-full h-auto"
              style={{ borderColor: "var(--border)" }}
            />
          ))}
        </div>
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

      {sel && (
        <button
          data-hlbtn=""
          onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); saveHighlight(); }}
          className="fixed z-[100] btn text-xs shadow-lg"
          style={{ top: sel.top, left: sel.left, transform: "translate(-50%, -100%)", padding: "6px 10px" }}
        >
          ★ Save highlight
        </button>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { SignalCard } from "@/components/SignalCard";
import {
  useSaved, setTags, type SavedItem,
  useHighlights, updateHighlightNote, setHighlightTags, removeHighlight, type Highlight,
  useReport, toggleReport,
} from "@/lib/saved";
import { fmtDate } from "@/lib/format";

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim().toLowerCase();
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setInput("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="label">tags:</span>
      {tags.map((t) => (
        <button key={t} onClick={() => onChange(tags.filter((x) => x !== t))} className="chip"
          style={{ color: "var(--accent)", borderColor: "var(--accent)" }} title="remove tag">
          {t} ×
        </button>
      ))}
      <input value={input} onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()} placeholder="add tag…" className="text-xs px-2 py-1 w-24" />
    </div>
  );
}

function HighlightCard({ h }: { h: Highlight }) {
  const [note, setNote] = useState(h.note);
  const { ids } = useReport();
  const inReport = ids.has(h.id);
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>{fmtDate(h.signalDate)} · {h.source}</span>
        <button
          onClick={() => toggleReport({
            id: h.id, kind: "highlight", heading: h.signalHeading, text: h.text, note,
            source: h.source, sourceId: h.sourceId, date: h.signalDate, post_url: h.postUrl,
          })}
          className="ml-auto chip"
          title={inReport ? "In report — click to remove" : "Add to report"}
          style={inReport ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}
        >
          {inReport ? "✓ Report" : "+ Report"}
        </button>
        <button onClick={() => removeHighlight(h.id)} className="chip" title="delete highlight">remove</button>
      </div>
      <blockquote className="border-l-2 pl-3 my-1 text-sm leading-relaxed" style={{ borderColor: "var(--accent)" }}>
        {h.text}
      </blockquote>
      <div className="label mt-2 mb-1">from “{h.signalHeading}”</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => updateHighlightNote(h.id, note)}
        placeholder="Add an annotation…"
        className="w-full text-sm px-3 py-2 mt-1"
        rows={2}
      />
      <div className="flex flex-wrap items-center gap-2 justify-between mt-2">
        <TagEditor tags={h.tags} onChange={(t) => setHighlightTags(h.id, t)} />
        <a href={h.postUrl} target="_blank" rel="noopener" className="chip">original post</a>
      </div>
    </div>
  );
}

export default function SavedPage() {
  const { items, allTags } = useSaved();
  const { items: highlights, allTags: hiTags } = useHighlights();
  const [tab, setTab] = useState<"entries" | "highlights">("entries");
  const [filter, setFilter] = useState("");

  const entryShown = filter ? items.filter((i) => i.tags.includes(filter)) : items;
  const hiShown = filter ? highlights.filter((i) => i.tags.includes(filter)) : highlights;
  const tags = tab === "entries" ? allTags : hiTags;
  const list = tab === "entries" ? items : highlights;

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Saved</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Your collection</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Pinned entries and your own highlighted excerpts with annotations. Tag anything to build
          themed collections — the raw material for your writing.
        </p>
      </div>

      <div className="flex gap-2">
        <button onClick={() => { setTab("entries"); setFilter(""); }} className="btn-ghost text-sm"
          style={tab === "entries" ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
          Entries ({items.length})
        </button>
        <button onClick={() => { setTab("highlights"); setFilter(""); }} className="btn-ghost text-sm"
          style={tab === "highlights" ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
          Highlights ({highlights.length})
        </button>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter("")} className="chip" style={filter === "" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
            All ({list.length})
          </button>
          {tags.map((t) => (
            <button key={t} onClick={() => setFilter(t)} className="chip" style={filter === t ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
              {t}
            </button>
          ))}
        </div>
      )}

      {tab === "entries" ? (
        entryShown.length === 0 ? (
          <Empty icon="☆" text="Nothing pinned yet. Hit the ★ on any signal to save it here." />
        ) : (
          <div className="space-y-4">
            {entryShown.map((item: SavedItem) => (
              <div key={item.signal.id}>
                <SignalCard s={item.signal} />
                <div className="mt-2 px-1">
                  <TagEditor tags={item.tags} onChange={(t) => setTags(item.signal.id, t)} />
                </div>
              </div>
            ))}
          </div>
        )
      ) : hiShown.length === 0 ? (
        <Empty icon="✎" text="No highlights yet. Select any text in a signal and click “★ Save highlight”." />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {hiShown.map((h) => <HighlightCard key={h.id} h={h} />)}
        </div>
      )}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="panel p-10 text-center" style={{ color: "var(--muted)" }}>
      <div className="text-4xl mb-3">{icon}</div>
      <p>{text}</p>
    </div>
  );
}

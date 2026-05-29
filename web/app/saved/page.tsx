"use client";
import { useState } from "react";
import { SignalCard } from "@/components/SignalCard";
import { useSaved, setTags, type SavedItem } from "@/lib/saved";

function TagEditor({ item }: { item: SavedItem }) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim().toLowerCase();
    if (t && !item.tags.includes(t)) setTags(item.signal.id, [...item.tags, t]);
    setInput("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2 px-1">
      <span className="label">tags:</span>
      {item.tags.map((t) => (
        <button
          key={t}
          onClick={() => setTags(item.signal.id, item.tags.filter((x) => x !== t))}
          className="chip"
          style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          title="remove tag"
        >
          {t} ×
        </button>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && add()}
        placeholder="add tag…"
        className="text-xs px-2 py-1 w-24"
      />
    </div>
  );
}

export default function SavedPage() {
  const { items, allTags } = useSaved();
  const [filter, setFilter] = useState("");
  const shown = filter ? items.filter((i) => i.tags.includes(filter)) : items;

  return (
    <div className="space-y-6">
      <div>
        <div className="label">Saved</div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Your pinned signals</h1>
        <p className="mt-2 max-w-2xl" style={{ color: "var(--muted)" }}>
          Everything you&apos;ve starred, with your own tags. Build collections around the themes you
          care about — these become the raw material for the Generator.
        </p>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter("")} className="chip" style={filter === "" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
            All ({items.length})
          </button>
          {allTags.map((t) => (
            <button key={t} onClick={() => setFilter(t)} className="chip" style={filter === t ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
              {t} ({items.filter((i) => i.tags.includes(t)).length})
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="panel p-10 text-center" style={{ color: "var(--muted)" }}>
          <div className="text-4xl mb-3">☆</div>
          <p>Nothing saved yet. Hit the ★ on any signal to pin it here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((item) => (
            <div key={item.signal.id}>
              <SignalCard s={item.signal} />
              <TagEditor item={item} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

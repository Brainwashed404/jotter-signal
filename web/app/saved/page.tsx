"use client";
import { useEffect, useRef, useState } from "react";
import { SignalCard } from "@/components/SignalCard";
import {
  useSaved, setTags, updateSavedNote, type SavedItem,
  useHighlights, updateHighlightNote, setHighlightTags, removeHighlight, type Highlight,
} from "@/lib/saved";
import { fmtDate } from "@/lib/format";
import CtaFooter from "@/components/CtaFooter";

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

function TagFilter({ tags, value, onChange, total }: { tags: string[]; value: string; onChange: (t: string) => void; total: number }) {
  if (tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={() => onChange("")} className="chip" style={value === "" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
        All ({total})
      </button>
      {tags.map((t) => (
        <button key={t} onClick={() => onChange(t)} className="chip" style={value === t ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
          {t}
        </button>
      ))}
    </div>
  );
}

function HighlightCard({ h }: { h: Highlight }) {
  const [note, setNote] = useState(h.note);

  // Share (mirrors SignalCard): OS share sheet, else an Email/WhatsApp/Copy menu.
  const shareRef = useRef<HTMLDivElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const shareUrl = h.postUrl || "";
  const shareText = `“${h.text}”${shareUrl ? `\n${shareUrl}` : ""}`;
  const enc = encodeURIComponent(shareText);
  const mailto = `mailto:?subject=${encodeURIComponent(h.signalHeading)}&body=${enc}`;
  const whatsapp = `https://wa.me/?text=${enc}`;
  function onShare() {
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && "share" in nav) nav.share({ title: h.signalHeading, text: h.text, url: shareUrl || undefined }).catch(() => {});
    else setShareOpen((o) => !o);
  }
  function copyShare() {
    navigator.clipboard?.writeText(shareText);
    setShareOpen(false);
  }
  useEffect(() => {
    if (!shareOpen) return;
    const close = (e: MouseEvent) => { if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [shareOpen]);

  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="mono text-xs" style={{ color: "var(--muted)" }}>{fmtDate(h.signalDate)} · {h.source}</span>
        <div ref={shareRef} className="ml-auto relative">
          <button onClick={onShare} className="chip" title="Share">Share</button>
          {shareOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 panel p-1 flex flex-col text-sm min-w-[140px]"
              style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
              <a href={mailto} className="px-3 py-1.5 rounded hover:bg-[var(--panel-2)]" onClick={() => setShareOpen(false)}>Email</a>
              <a href={whatsapp} target="_blank" rel="noopener" className="px-3 py-1.5 rounded hover:bg-[var(--panel-2)]" onClick={() => setShareOpen(false)}>WhatsApp</a>
              <button onClick={copyShare} className="px-3 py-1.5 rounded hover:bg-[var(--panel-2)] text-left">Copy link</button>
            </div>
          )}
        </div>
        <button onClick={() => removeHighlight(h.id)} className="text-lg leading-none"
          title="Saved highlight — click to remove" style={{ color: "var(--accent)" }}>
          ★
        </button>
      </div>
      <blockquote className="border-l-2 pl-3 my-1 text-sm leading-relaxed" style={{ borderColor: "var(--accent)" }}>
        {h.text}
      </blockquote>
      <div className="label mt-2 mb-1">from “{h.signalHeading}”</div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => updateHighlightNote(h.id, note)}
        placeholder="Jot down your thoughts…"
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

function SavedArticleCard({ item }: { item: SavedItem }) {
  const [note, setNote] = useState(item.note ?? "");
  return (
    <div>
      <SignalCard s={item.signal} />
      <div className="mt-2 px-1 space-y-2">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => updateSavedNote(item.signal.id, note)}
          placeholder="Jot down your thoughts…"
          className="w-full text-sm px-3 py-2"
          rows={2}
          style={{ borderRadius: "10px" }}
        />
        <TagEditor tags={item.tags} onChange={(t) => setTags(item.signal.id, t)} />
      </div>
    </div>
  );
}

export default function SavedPage() {
  const { items: entries, allTags: entryTags } = useSaved();
  const { items: highlights, allTags: hiTags } = useHighlights();
  const [tab, setTab] = useState<"articles" | "highlights">("articles");
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");

  const switchTab = (t: "articles" | "highlights") => { setTab(t); setFilter(""); };
  const tags = tab === "articles" ? entryTags : hiTags;
  const total = tab === "articles" ? entries.length : highlights.length;
  const q = query.trim().toLowerCase();
  const matchEntry = (i: SavedItem) => !q || [i.signal.heading, i.signal.text, i.signal.source, ...i.tags, i.note ?? ""].join(" ").toLowerCase().includes(q);
  const matchHi = (h: Highlight) => !q || [h.text, h.signalHeading, h.source, ...h.tags].join(" ").toLowerCase().includes(q);
  const shownEntries = entries.filter((i) => (!filter || i.tags.includes(filter)) && matchEntry(i));
  const shownHi = highlights.filter((i) => (!filter || i.tags.includes(filter)) && matchHi(i));

  return (
    <div className="space-y-6">
      {/* sticky, centred tab switcher + search */}
      <div className="sticky z-40 -mx-5 px-5 py-3 flex items-center gap-2 backdrop-blur"
        style={{ top: "3.5rem", background: "var(--header-bg)" }}>
        <div className="flex-1" />
        <button onClick={() => switchTab("articles")} className="btn-ghost text-sm"
          style={tab === "articles" ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
          Articles ({entries.length})
        </button>
        <button onClick={() => switchTab("highlights")} className="btn-ghost text-sm"
          style={tab === "highlights" ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
          Highlights ({highlights.length})
        </button>
        <div className="flex-1 flex justify-end">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved…"
            className="text-sm px-3 py-1.5 rounded-lg border bg-transparent w-44 max-w-[40vw] outline-none"
            style={{ borderColor: "var(--border)" }}
          />
        </div>
      </div>

      <TagFilter tags={tags} value={filter} onChange={setFilter} total={total} />

      {tab === "articles" ? (
        shownEntries.length === 0 ? (
          <Empty icon="☆" text="Nothing pinned yet. Hit the ★ on any signal to save it here." />
        ) : (
          <div className="space-y-4">
            {shownEntries.map((item: SavedItem) => (
              <SavedArticleCard key={item.signal.id} item={item} />
            ))}
          </div>
        )
      ) : shownHi.length === 0 ? (
        <Empty icon="✎" text="No highlights yet. Select any text in a signal and click “★ Save highlight”." />
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {shownHi.map((h) => <HighlightCard key={h.id} h={h} />)}
        </div>
      )}

      <CtaFooter />
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

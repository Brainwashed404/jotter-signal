"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function PdfUpload({ category = "author" }: { category?: "author" | "publication" }) {
  const [tab, setTab] = useState<"pdf" | "rss">("pdf");
  const [name, setName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function uploadFile(file: File) {
    setBusy(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("mode", "archive");
      fd.append("category", category);
      if (name.trim()) fd.append("title", name.trim());
      const res = await fetch("/api/upload-pdf", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) setMsg({ ok: false, text: d.error || "Upload failed." });
      else { setMsg({ ok: true, text: `Added “${d.title}”.` }); router.refresh(); }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function addFeed() {
    if (!feedUrl.trim()) { setMsg({ ok: false, text: "Enter a feed URL." }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/sources", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedUrl: feedUrl.trim(), name: name.trim(), category }),
      });
      const d = await res.json();
      if (!res.ok) setMsg({ ok: false, text: d.error || "Couldn't add feed." });
      else { setMsg({ ok: true, text: `Added “${d.name}” — ${d.added} item${d.added > 1 ? "s" : ""}.` }); setFeedUrl(""); router.refresh(); }
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1" />
        <button onClick={() => { setTab("pdf"); setMsg(null); }} className="chip"
          style={tab === "pdf" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>PDF</button>
        <button onClick={() => { setTab("rss"); setMsg(null); }} className="chip"
          style={tab === "rss" ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>RSS feed</button>
      </div>

      <div className="label" style={{ textTransform: "none", letterSpacing: 0 }}>
        {tab === "pdf"
          ? "Upload a report, white paper or deck — parsed into a single searchable, Ask-able, citable entry. Optional name files it under that profile."
          : "Paste an RSS/Atom feed URL — recent items are ingested as signals under a new source."}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder={tab === "pdf" ? "Profile name (optional)" : "Source name (optional — defaults to feed title)"}
          className="px-3 py-2 text-sm flex-1 min-w-[200px]" />
        {tab === "rss" && (
          <input value={feedUrl} onChange={(e) => setFeedUrl(e.target.value)}
            placeholder="https://example.com/feed" className="px-3 py-2 text-sm flex-1 min-w-[220px]" />
        )}
      </div>

      <div className="flex gap-2 items-center">
        {tab === "pdf" ? (
          <>
            <input ref={inputRef} type="file" accept="application/pdf,.pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); }} />
            <button className="btn" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? "Working…" : "Upload PDF"}
            </button>
          </>
        ) : (
          <button className="btn" disabled={busy} onClick={addFeed}>{busy ? "Fetching…" : "Add feed"}</button>
        )}
        {msg && <span className="label" style={{ textTransform: "none", letterSpacing: 0, color: msg.ok ? "var(--up)" : "var(--down)" }}>{msg.text}</span>}
      </div>
    </div>
  );
}

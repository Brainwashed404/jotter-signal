"use client";
import { useState } from "react";

const FORMATS = [
  { id: "brief", label: "Foresight brief", hint: "Commentary, quotes & sources organised for a client brief" },
  { id: "pov", label: "Thought-leadership POV", hint: "Material to write a point-of-view article from" },
  { id: "cards", label: "Trend cards", hint: "Evidence grouped for workshop / deck cards" },
];

const EXAMPLES = [
  "The AI bubble and its fallout",
  "Anti-tech populism",
  "AI and the future of cybersecurity",
  "Democratic backsliding and technology",
];

function md(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent-2)">$1</a>');
  const lines = src.split("\n");
  let html = "", inList = false, inQuote = false;
  const closeQuote = () => { if (inQuote) { html += "</blockquote>"; inQuote = false; } };
  const closeList = () => { if (inList) { html += "</ul>"; inList = false; } };
  for (const ln of lines) {
    if (/^### /.test(ln)) { closeList(); closeQuote(); html += `<h3 class="font-semibold mt-5 mb-1">${inline(ln.slice(4))}</h3>`; }
    else if (/^## /.test(ln)) { closeList(); closeQuote(); html += `<h2 class="text-lg font-semibold mt-6 mb-2">${inline(ln.slice(3))}</h2>`; }
    else if (/^# /.test(ln)) { closeList(); closeQuote(); html += `<h1 class="text-2xl font-bold mt-2 mb-2">${inline(ln.slice(2))}</h1>`; }
    else if (/^> /.test(ln)) { closeList(); if (!inQuote) { html += '<blockquote class="border-l-2 pl-3 my-1" style="border-color:var(--accent)">'; inQuote = true; } html += `<div>${inline(ln.slice(2))}</div>`; }
    else if (/^---/.test(ln)) { closeList(); closeQuote(); html += '<hr class="my-4" style="border-color:var(--border)"/>'; }
    else if (/^[-*] /.test(ln)) { closeQuote(); if (!inList) { html += '<ul class="list-disc pl-5 space-y-1 my-2">'; inList = true; } html += `<li>${inline(ln.slice(2))}</li>`; }
    else if (ln.trim() === "") { closeList(); closeQuote(); }
    else { closeList(); closeQuote(); html += `<p class="my-2 leading-relaxed">${inline(ln)}</p>`; }
  }
  closeList(); closeQuote();
  return html;
}

export default function Generator() {
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("brief");
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState<{ mode: string; count: number; filename: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function go() {
    if (!topic) return;
    setLoading(true); setOut(""); setMeta(null);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic, format }),
    });
    const data = await res.json();
    setOut(data.markdown ?? data.error ?? "Something went wrong.");
    setMeta(data.markdown ? { mode: data.mode, count: data.count, filename: data.filename } : null);
    setLoading(false);
  }

  function download() {
    if (!out || !meta) return;
    const blob = new Blob([out], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = meta.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-6 items-start">
      <div className="panel p-5 space-y-4 lg:sticky lg:top-20">
        <div>
          <div className="label mb-2">Topic</div>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder="e.g. The AI bubble"
            className="w-full px-3 py-2.5 text-sm"
          />
          <div className="flex flex-wrap gap-1.5 mt-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => setTopic(e)} className="chip">{e}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-2">Shape the report for…</div>
          <div className="space-y-2">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className="w-full text-left panel panel-hover p-3"
                style={format === f.id ? { borderColor: "var(--accent)" } : {}}
              >
                <div className="text-sm font-medium">{f.label}</div>
                <div className="label mt-0.5" style={{ textTransform: "none", letterSpacing: 0 }}>{f.hint}</div>
              </button>
            ))}
          </div>
        </div>
        <button className="btn w-full" onClick={go} disabled={loading || !topic}>
          {loading ? "Compiling…" : "Build research report"}
        </button>
      </div>

      <div className="panel p-6 min-h-[400px]">
        {!out && !loading && (
          <div className="h-full grid place-items-center text-center" style={{ color: "var(--muted)" }}>
            <div>
              <div className="text-4xl mb-3">◭</div>
              <p>Pick a topic.<br />Jotter Intelligence compiles a clean, sourced research report from the archive —<br />ready to download and write from.</p>
            </div>
          </div>
        )}
        {loading && <div className="label">Retrieving and organising signals…</div>}
        {out && (
          <>
            {meta && (
              <div className="flex items-center gap-2 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="chip" style={{ color: "var(--accent)" }}>
                  {meta.mode === "ai" ? "● AI-written" : "● research report"}
                </span>
                <span className="label">{meta.count} signals · cited & dated</span>
                <div className="ml-auto flex gap-2">
                  <button className="btn-ghost text-xs" onClick={() => navigator.clipboard.writeText(out)}>Copy</button>
                  <button className="btn text-xs" onClick={download}>Download .md</button>
                </div>
              </div>
            )}
            <div dangerouslySetInnerHTML={{ __html: md(out) }} />
          </>
        )}
      </div>
    </div>
  );
}

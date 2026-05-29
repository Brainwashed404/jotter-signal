"use client";
import { useState } from "react";

const FORMATS = [
  { id: "brief", label: "Foresight brief", hint: "Client-ready: thesis, signals, implications, signposts" },
  { id: "pov", label: "Thought-leadership POV", hint: "~600-word LinkedIn article in a confident voice" },
  { id: "cards", label: "Trend cards", hint: "5 cards for a workshop or deck" },
];

const EXAMPLES = [
  "The AI bubble and its fallout",
  "Anti-tech populism",
  "AI and the future of cybersecurity",
  "Democratic backsliding and technology",
];

// minimal markdown -> html
function md(src: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" style="color:var(--accent-2)">$1</a>');
  const lines = src.split("\n");
  let html = "", inList = false;
  for (const ln of lines) {
    if (/^### /.test(ln)) { if (inList) { html += "</ul>"; inList = false; } html += `<h3 class="font-semibold mt-4 mb-1">${inline(ln.slice(4))}</h3>`; }
    else if (/^## /.test(ln)) { if (inList) { html += "</ul>"; inList = false; } html += `<h2 class="text-lg font-semibold mt-5 mb-2">${inline(ln.slice(3))}</h2>`; }
    else if (/^# /.test(ln)) { if (inList) { html += "</ul>"; inList = false; } html += `<h1 class="text-2xl font-bold mt-2 mb-2">${inline(ln.slice(2))}</h1>`; }
    else if (/^[-*] /.test(ln)) { if (!inList) { html += '<ul class="list-disc pl-5 space-y-1 my-2">'; inList = true; } html += `<li>${inline(ln.slice(2))}</li>`; }
    else if (ln.trim() === "") { if (inList) { html += "</ul>"; inList = false; } }
    else { if (inList) { html += "</ul>"; inList = false; } html += `<p class="my-2 leading-relaxed">${inline(ln)}</p>`; }
  }
  if (inList) html += "</ul>";
  return html;
}

export default function Generator() {
  const [topic, setTopic] = useState("");
  const [format, setFormat] = useState("brief");
  const [out, setOut] = useState("");
  const [meta, setMeta] = useState<{ grounded: boolean; count: number } | null>(null);
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
    setMeta({ grounded: data.grounded, count: data.count });
    setLoading(false);
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
          <div className="label mb-2">Format</div>
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
          {loading ? "Synthesising…" : "Generate"}
        </button>
      </div>

      <div className="panel p-6 min-h-[400px]">
        {!out && !loading && (
          <div className="h-full grid place-items-center text-center" style={{ color: "var(--muted)" }}>
            <div>
              <div className="text-4xl mb-3">◭</div>
              <p>Pick a topic and format.<br />The Generator grounds every claim in real signals, with citations.</p>
            </div>
          </div>
        )}
        {loading && <div className="label">Retrieving signals and synthesising…</div>}
        {out && (
          <>
            {meta && (
              <div className="flex items-center gap-2 mb-4 pb-4" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="chip" style={{ color: meta.grounded ? "var(--up)" : "var(--accent)" }}>
                  {meta.grounded ? "● LLM-synthesised" : "● evidence pack (no key)"}
                </span>
                <span className="label">grounded in {meta.count} signals</span>
                <button
                  className="btn-ghost ml-auto text-xs"
                  onClick={() => navigator.clipboard.writeText(out)}
                >
                  Copy markdown
                </button>
              </div>
            )}
            <div dangerouslySetInnerHTML={{ __html: md(out) }} />
          </>
        )}
      </div>
    </div>
  );
}

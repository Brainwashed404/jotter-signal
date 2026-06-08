"use client";
import { useEffect, useRef, useState } from "react";
import {
  SKINS, FONT_SIZES, type Skin, type FontSize,
  getSkin, setSkin, getFontSize, setFontSize, getSkinOrder, setSkinOrder,
} from "@/lib/appearance";
import CollapsibleSection from "@/components/CollapsibleSection";

const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s]));

export default function SettingsPage() {
  const [skin, setSkinState] = useState<Skin>("default");
  const [size, setSizeState] = useState<FontSize>("md");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [order, setOrder] = useState<Skin[]>(SKINS.map((s) => s.id));
  const dragId = useRef<Skin | null>(null);
  const [dragging, setDragging] = useState<Skin | null>(null);

  useEffect(() => {
    setSkinState(getSkin());
    setSizeState(getFontSize());
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
    setOrder(getSkinOrder());
  }, []);

  function chooseSkin(s: Skin) {
    setSkin(s); setSkinState(s);
    chooseTheme(SKIN_BY_ID[s]?.dark ? "dark" : "light");
  }
  function chooseSize(f: FontSize) { setFontSize(f); setSizeState(f); }
  function chooseTheme(t: "light" | "dark") {
    setTheme(t);
    if (t === "light") { document.documentElement.setAttribute("data-theme", "light"); localStorage.setItem("jotter.theme.v2", "light"); }
    else { document.documentElement.removeAttribute("data-theme"); localStorage.setItem("jotter.theme.v2", "dark"); }
  }

  function onDragEnter(targetId: Skin) {
    const from = dragId.current;
    if (!from || from === targetId) return;
    setOrder((prev) => {
      const a = [...prev];
      a.splice(a.indexOf(targetId), 0, ...a.splice(a.indexOf(from), 1));
      return a;
    });
  }
  function endDrag() {
    setOrder((cur) => { setSkinOrder(cur); return cur; });
    dragId.current = null;
    setDragging(null);
  }

  return (
    <div className="space-y-8" data-settings>
      {/* ── About (top; collapsed) ─────────────────────────────────── */}
      <CollapsibleSection title="About" defaultOpen={false}>
        <div className="space-y-5 text-sm max-w-2xl" style={{ color: "var(--body-text)" }}>
          <p>
            Jotter is a London-based independent consultancy that helps ambitious brands build audience, establish
            market credibility, and communicate with cultural precision. We work across tech, media and culture,
            from pre-unicorn startups to Fortune 500 companies, on everything from strategic repositioning and
            creative experiments to large-scale platform builds and viral campaigns.
          </p>
          {[
            ["Why we built this",
              "Good strategy starts with knowing what the sharpest minds are actually thinking, before it reaches the mainstream. We were doing that tracking by hand across dozens of newsletters, feeds and data sources. Jotter Intelligence is that workflow, productised: one place to watch the signal instead of the noise."],
            ["What it is",
              "An insights dashboard built for our clients and researchers. It ingests curated experts and publications, atomises them into time-stamped signals, and surfaces the themes, momentum and convergence worth paying attention to, alongside live news, markets and public-attention data. A daily workbench for cultural and strategic foresight."],
            ["How it works",
              "Technology is always in service of our original ideas, never the other way around. The dashboard is deterministic: it tracks what a hand-picked set of thinkers are genuinely publishing, drawn from open sources. There is no AI or large-language-model layer making things up, no tracking, and no accounts."],
          ].map(([h, body]) => (
            <div key={h}>
              <div className="font-semibold mb-0.5">{h}</div>
              <p style={{ color: "var(--muted)" }}>{body}</p>
            </div>
          ))}

          <div>
            <div className="font-semibold mb-0.5">Work with us</div>
            <p style={{ color: "var(--muted)" }}>
              We help brands turn cultural intelligence into commercial impact.
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <a href="https://jotter.media" target="_blank" rel="noopener noreferrer" className="btn">Visit jotter.media ↗</a>
              <a href="mailto:studio@jotter.media" className="btn-ghost">Email studio@jotter.media</a>
            </div>
          </div>

          <div className="pt-3" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="label mb-1">Legal disclaimer</div>
            <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
              Jotter Intelligence is provided for general information and research purposes only. It aggregates
              third-party content and live data from public sources; that material belongs to its respective
              owners and is shown for commentary and analysis. Jotter does not guarantee the accuracy,
              completeness or timeliness of any information here, and nothing in this dashboard constitutes
              financial, investment, legal or professional advice. Market data is delayed and indicative only.
              Use of, or reliance on, any information is at your own risk. © {new Date().getFullYear()} Jotter.
              All trademarks are the property of their respective owners.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* ── User guide (top; collapsed) ────────────────────────────── */}
      <CollapsibleSection title="User guide" defaultOpen={false}>
        <div className="space-y-4 text-sm max-w-2xl" style={{ color: "var(--body-text)" }}>
          <p style={{ color: "var(--muted)" }}>
            Jotter Intelligence turns the world&apos;s sharpest minds into a daily workbench. Here is how the pieces fit together.
          </p>
          {[
            ["Home", "Your daily briefing: live trending news (drag the pills to reorder, tap one to switch source), a global markets ticker (tap an index to expand its interactive chart), and the latest insight from every expert and publication."],
            ["Feed", "The full archive. Whole-word search across every signal, with filters by kind (Long Reads, Articles, Q&A, Links, Data), theme, year and source. Tap any card to expand it; read cards are dimmed so you can see what you have already covered."],
            ["Experts and Publications", "The curated sources. Each profile shows that voice's full feed with its own filters. Sources are added behind the scenes from the feeds they publish openly (newsletters, blogs, RSS)."],
            ["Saved", "Star any signal to pin it, or select text inside a card to save a highlight. Both live here, each with a free-text note box (“Jot down your thoughts”) and tags. Search and filter your saved items at the top."],
            ["Weather, date and clock pill", "The pill in the header is interactive: tap the temperature for an hourly / daily / rain / wind forecast, the date for a two-month calendar, or the time for a world clock."],
            ["Radio", "The left sidebar is an internet-radio player with hundreds of stations by genre. It remembers your last station and favourites, and the OS media keys control it."],
            ["Appearance", "Choose a skin and a text size below. Each skin ships a light and a night mode, and your choice is remembered on this device."],
          ].map(([h, body]) => (
            <div key={h}>
              <div className="font-semibold mb-0.5">{h}</div>
              <p style={{ color: "var(--muted)" }}>{body}</p>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* ── Text size (expanded) ───────────────────────────────────── */}
      <CollapsibleSection title="Text size" defaultOpen={true}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {FONT_SIZES.map((f) => (
              <button key={f.id} onClick={() => chooseSize(f.id)} className="btn-ghost"
                style={size === f.id ? { borderColor: "var(--accent)", color: "var(--accent)" } : {}}>
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Scales the whole interface. Applies instantly and is remembered on this device.</p>
        </div>
      </CollapsibleSection>

      {/* ── Skins (expanded) ───────────────────────────────────────── */}
      <CollapsibleSection title="Skins" defaultOpen={true}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <span className="text-xs" style={{ color: "var(--muted)" }}>Drag to reorder</span>
            <div className="flex items-center gap-2">
              <span className="label mr-1">Mode</span>
              {(["light", "dark"] as const).map((t) => (
                <button key={t} onClick={() => chooseTheme(t)} className="chip"
                  style={theme === t ? { color: "var(--accent)", borderColor: "var(--accent)" } : {}}>
                  {t === "light" ? "Light" : "Dark"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {order.map((id) => {
              const s = SKIN_BY_ID[id];
              if (!s) return null;
              const active = skin === s.id;
              return (
                <button
                  key={s.id}
                  draggable
                  onDragStart={(e) => { dragId.current = s.id; setDragging(s.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnter={() => onDragEnter(s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDragEnd={endDrag}
                  onClick={() => chooseSkin(s.id)}
                  className="panel panel-hover p-4 text-left flex flex-col gap-2 cursor-grab active:cursor-grabbing"
                  style={{
                    ...(active ? { borderColor: "var(--accent)", boxShadow: "0 0 0 2px var(--accent)" } : {}),
                    opacity: dragging === s.id ? 0.4 : 1,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{s.name}</span>
                    <span className="flex items-center gap-2">
                      {active && <span className="label" style={{ color: "var(--accent)" }}>Active</span>}
                      <span aria-hidden style={{ color: "var(--muted)", letterSpacing: "-2px", fontSize: 14, lineHeight: 1 }}>⠿</span>
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    {s.swatch.map((c, i) => (
                      <span key={i} className="h-5 w-5 rounded-full" style={{ background: c, border: "1px solid rgba(0,0,0,0.15)" }} />
                    ))}
                  </div>
                  <p className="text-xs leading-snug" style={{ color: "var(--muted)" }}>{s.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
      </CollapsibleSection>

      {/* Sign out of beta */}
      <div className="pt-2">
        <button
          className="btn-ghost text-xs"
          style={{ color: "var(--muted)" }}
          onClick={async () => {
            await fetch("/api/auth", { method: "DELETE" });
            window.location.href = "/login";
          }}
        >
          Sign out of beta
        </button>
      </div>
    </div>
  );
}

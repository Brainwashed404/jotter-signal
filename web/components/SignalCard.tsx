"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { Signal } from "@/lib/types";
import { KIND_LABEL } from "@/lib/types";
import { useSaved, toggleSave, addHighlight } from "@/lib/saved";
import { themesFor } from "@/lib/themes";
import { fmtDate } from "@/lib/format";

// Matches both ![alt](url) images and [text](url) links in one pass.
const INLINE = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
const demd = (t: string) =>
  t.replace(/!\[[^\]]*\]\([^)]+\)/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

// Renders signal body text with inline markdown links and images at their original positions.
function renderBody(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0, i = 0, m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] === "!") {
      // Inline image — rendered where the author placed it
      nodes.push(
        <figure key={i++} className="my-2" style={{ margin: "0.6rem 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m[3]} alt={m[2]} loading="lazy"
            style={{ maxWidth: "100%", height: "auto", borderRadius: 4, display: "block" }} />
          {m[2] && <figcaption className="text-xs mt-1" style={{ color: "var(--muted)" }}>{m[2]}</figcaption>}
        </figure>
      );
    } else {
      nodes.push(
        <a key={i++} href={m[3]} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()} className="underline" style={{ color: "var(--accent-2)" }}>
          {m[2]}
        </a>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function SignalCard({ s }: { s: Signal }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const shareRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<{ text: string; top: number; left: number } | null>(null);
  const [flash, setFlash] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const { ids } = useSaved();
  const saved = ids.has(s.id);

  // Share this box's content via the OS sheet (email/WhatsApp/etc), or a fallback menu.
  const shareUrl = s.post_url || "";
  const shareText = `${s.heading}${shareUrl ? `\n${shareUrl}` : ""}`;
  const enc = encodeURIComponent(shareText);
  const mailto = `mailto:?subject=${encodeURIComponent(s.heading)}&body=${enc}`;
  const whatsapp = `https://wa.me/?text=${enc}`;

  function onShare(e: React.MouseEvent) {
    e.stopPropagation();
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && "share" in nav) {
      nav.share({ title: s.heading, text: s.heading, url: shareUrl || undefined }).catch(() => {});
    } else {
      setShareOpen((o) => !o);
    }
  }
  function copyShare() {
    navigator.clipboard?.writeText(shareText);
    setShareOpen(false);
    setFlash("✓ copied"); setTimeout(() => setFlash(""), 1600);
  }
  const long = s.text.length > 360;
  const hasImages = !!(s.images && s.images.length);
  const expandable = long || hasImages;
  // Cards show the author's name only (strip the "(Blog)" suffix); publications keep their full name.
  const sourceLabel = s.category === "publication" ? s.source : s.source.replace(/\s*\([^)]*\)\s*$/, "");

  // close the share menu only when clicking outside it
  useEffect(() => {
    if (!shareOpen) return;
    const close = (e: MouseEvent) => {
      if (shareRef.current && !shareRef.current.contains(e.target as Node)) setShareOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [shareOpen]);

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
    setFlash("✓ highlight saved");
    setTimeout(() => setFlash(""), 1600);
  }

  function onCardClick(e: React.MouseEvent) {
    if (!expandable) return;
    if (window.getSelection()?.toString().trim()) return;
    if ((e.target as HTMLElement).closest("a,button,input,textarea")) return;
    setOpen((o) => {
      const next = !o;
      if (next) {
        setTimeout(() => {
          const el = cardRef.current;
          if (!el) return;
          const top = el.getBoundingClientRect().top + window.scrollY - 72;
          window.scrollTo({ top, behavior: "smooth" });
        }, 0);
      }
      return next;
    });
  }

  return (
    <div
      ref={cardRef}
      onClick={onCardClick}
      className={`panel panel-hover p-4 relative min-w-0${open ? " md:col-span-2" : ""}`}
      style={{ cursor: expandable ? "pointer" : undefined }}
    >
      {flash && (
        <div className="absolute top-2 right-2 chip" style={{ color: "var(--up)", borderColor: "var(--up)" }}>
          {flash}
        </div>
      )}
      <div className="flex items-center gap-2 mb-2">
        <span className="chip shrink-0" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
          {KIND_LABEL[s.kind] ?? KIND_LABEL[s.type] ?? s.kind}
        </span>
        {/* date + source on one tidy line (date never wraps; source truncates) */}
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="mono text-xs shrink-0 whitespace-nowrap" style={{ color: "var(--muted)" }}>{fmtDate(s.date)}</span>
          <Link href={`/sources/${s.source_id}`} className="mono text-xs truncate hover:underline" style={{ color: "var(--muted)" }}>
            · {sourceLabel}
          </Link>
        </div>
        <div ref={shareRef} className="relative shrink-0">
          {/* desktop: text chip; mobile: compact icon (declutters the card) */}
          <button onClick={onShare} className="chip max-md:hidden" title="Share">Share</button>
          <button onClick={onShare} className="md:hidden w-7 h-7 grid place-items-center rounded-md" title="Share" style={{ color: "var(--muted)" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
              <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" /><line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
            </svg>
          </button>
          {shareOpen && (
            <div className="absolute right-0 top-full mt-1 z-20 panel p-1 flex flex-col text-sm min-w-[140px]"
              onClick={(e) => e.stopPropagation()} style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
              <a href={mailto} className="px-3 py-1.5 rounded hover:bg-[var(--panel-2)]" onClick={() => setShareOpen(false)}>Email</a>
              <a href={whatsapp} target="_blank" rel="noopener" className="px-3 py-1.5 rounded hover:bg-[var(--panel-2)]" onClick={() => setShareOpen(false)}>WhatsApp</a>
              <button onClick={copyShare} className="px-3 py-1.5 rounded hover:bg-[var(--panel-2)] text-left">Copy link</button>
            </div>
          )}
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); toggleSave(s); }}
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
        style={{ color: "var(--body-text)", overflowWrap: "anywhere", wordBreak: "break-word" }}
      >
        {open || !long ? renderBody(s.text) : demd(s.text).slice(0, 360) + "…"}
      </p>
      {expandable && (
        <button onClick={() => setOpen((o) => !o)} className="text-xs mt-1.5" style={{ color: "var(--accent-2)" }}>
          {open ? "Show less ▲" : "Read full text ▼"}
        </button>
      )}

      {/* Trailing images fallback — only shown for signals not yet rebuilt with inline images.
          After running build_dataset.py, images appear inline and this block stays hidden. */}
      {open && s.images && s.images.length > 0 && !s.text.includes("![") && (
        <div className="mt-3 space-y-2">
          {s.images.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={src} alt="" loading="lazy"
              className="rounded-lg border w-full h-auto"
              style={{ borderColor: "var(--border)" }}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-3">
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

import "server-only";
import fs from "fs";
import type { Signal, Expert } from "./types";
import { themesFor } from "./themes";
import { clearCache, getExpert, UPLOADS_SIG_PATH, UPLOADS_EXP_PATH } from "./data";

// Uploads live in their OWN store, separate from the engine's signals.jsonl/experts.json,
// so build_dataset.py (which overwrites those) never wipes user uploads or in-app feeds.
const SIG_PATH = UPLOADS_SIG_PATH;
const EXP_PATH = UPLOADS_EXP_PATH;

function readSignals(): Signal[] {
  try { return fs.readFileSync(SIG_PATH, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Signal); }
  catch { return []; }
}
function writeSignals(s: Signal[]) {
  fs.writeFileSync(SIG_PATH, s.map((x) => JSON.stringify(x)).join("\n") + (s.length ? "\n" : ""));
}
function readExperts(): Expert[] {
  try { return JSON.parse(fs.readFileSync(EXP_PATH, "utf8")); } catch { return []; }
}
function writeExperts(e: Expert[]) {
  fs.writeFileSync(EXP_PATH, JSON.stringify(e, null, 1));
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "profile";
}

const ACRONYMS = /^(ai|us|uk|eu|un|llm|gpt|ceo|cfo|cto|ux|ui|api|vr|ar|ev|iot|saas|b2b|b2c|nft|gdp|nhs|bbc)$/i;
// "ai-companionship-market" / "AI_Companionship_Market" -> "AI Companionship Market"
export function prettyName(s: string): string {
  return s.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
    .split(" ")
    .map((w) => (ACRONYMS.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ") || "Document";
}

// Only user-created (uploaded) profiles may be mutated/deleted — never curated experts.
export function isManaged(e: Expert | undefined): boolean {
  return !!e && e.uploaded === true && /^doc-/.test(e.id);
}

// Rebuild one uploaded expert's aggregate from its current signals (or drop the
// signal-derived fields to zero if it has none — an empty profile is still valid).
function recompute(expertId: string, sigs: Signal[], base: Partial<Expert>): Expert {
  const mine = sigs.filter((s) => s.source_id === expertId);
  const themeCount = new Map<string, number>();
  for (const s of mine) for (const t of s.themes) themeCount.set(t, (themeCount.get(t) ?? 0) + 1);
  const years = [...new Set(mine.map((s) => String(s.year)))].sort();
  const dates = mine.map((s) => s.date.slice(0, 10)).sort();
  const uploads = new Set(mine.map((s) => s.upload_id).filter(Boolean));
  // posts = uploaded docs (with upload_id) + feed items (with a post_url) — i.e. distinct sources
  const postKeys = new Set(mine.map((s) => s.upload_id || s.post_url || s.id));
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: expertId,
    name: base.name ?? expertId,
    blurb: base.blurb ?? "",
    url: base.url ?? "",
    totals: {
      posts: uploads.size || postKeys.size,
      signals: mine.length,
      date_min: dates[0] ?? today,
      date_max: dates[dates.length - 1] ?? today,
    },
    signal_types: { article: mine.length },
    signal_kinds: mine.reduce<Record<string, number>>((a, s) => ((a[s.kind] = (a[s.kind] ?? 0) + 1), a), {}),
    themes: [...themeCount.entries()].sort((a, b) => b[1] - a[1]).map(([theme]) => ({ theme, current: 0, delta: 0, series: { [today.slice(0, 4)]: 0 } })),
    years: years.length ? years : [today.slice(0, 4)],
    top_sources_recent: [],
    top_sources_early: [],
    uploaded: true,
    category: base.category === "publication" ? "publication" : "author",
  };
}

// PDF/feed text often loses paragraph structure (one run-on blob). Rebuild readable
// paragraphs (keeping existing breaks if present) and return ONE formatted string.
export function paragraphize(text: string, cap = 60000): string {
  const hadBreaks = /\n\s*\n/.test(text);
  let paragraphs: string[];
  if (hadBreaks) {
    paragraphs = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  } else {
    const norm = text.replace(/­/g, "").replace(/\s+/g, " ").trim();
    // Split only on real boundaries (terminator + space + capital/quote) so decimals
    // like "$83.8bn" and abbreviations stay intact.
    const sentences = norm.split(/(?<=[.!?])\s+(?=[A-Z"'“(])/);
    paragraphs = [];
    let buf: string[] = [], len = 0;
    for (const s of sentences) {
      const t = s.trim();
      if (!t) continue;
      buf.push(t); len += t.length;
      if (len > 360 || buf.length >= 4) { paragraphs.push(buf.join(" ")); buf = []; len = 0; }
    }
    if (buf.length) paragraphs.push(buf.join(" "));
  }
  return paragraphs.join("\n\n").slice(0, cap).trim();
}

// Strip HTML to readable text (for RSS feed item bodies).
export function htmlToText(html: string): string {
  return html
    .replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "") // unwrap CDATA before tag-stripping
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<\/(p|div|li|h[1-6]|br)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function kindOf(text: string): string {
  return text.length > 2500 ? "longread" : "article";
}

type Category = "author" | "publication";

// Create an empty profile (no documents yet). Returns the source id.
export function createProfile(name: string, blurb = "", category: Category = "author"): string {
  const id = `doc-${slugify(name)}`;
  const experts = readExperts();
  if (!experts.some((e) => e.id === id)) {
    experts.push(recompute(id, readSignals(), { name, blurb, category }));
    writeExperts(experts);
    clearCache();
  }
  return id;
}

// Attach a PDF to a profile. Target can be: an existing managed (doc-*) profile, an existing
// CURATED expert (signals appended, no managed record created), or a new managed profile.
export function attachPdf(opts: { expertId?: string; name?: string; blurb?: string; uploadName: string; text: string; date?: string; category?: Category }) {
  const managed = readExperts();
  let id = opts.expertId;
  let rec = id ? managed.find((e) => e.id === id) : undefined;
  const curated = !!id && !rec && !!getExpert(id!); // exists in engine but not a managed profile
  if (id && !rec && !curated) throw new Error("Unknown profile.");
  if (!id) {
    const nm = opts.name?.trim() || opts.uploadName;
    id = `doc-${slugify(nm)}`;
    rec = managed.find((e) => e.id === id);
    if (!rec) { rec = recompute(id, [], { name: nm, blurb: opts.blurb, category: opts.category }); managed.push(rec); }
  }
  const name = rec?.name ?? getExpert(id!)?.name ?? (opts.name?.trim() || opts.uploadName);

  const uploadId = `u${Date.now()}`;
  const date = opts.date || new Date().toISOString().slice(0, 10); // PDF metadata date if available
  const body = paragraphize(opts.text);          // ONE entry per PDF, not split
  const sigs = readSignals();
  const existing = sigs.filter((s) => s.source_id === id).length;
  const signal: Signal = {
    id: `${id}-${uploadId}`,
    post_id: uploadId,
    date,
    year: Number(date.slice(0, 4)),
    source: name,
    source_id: id!,
    type: "article",
    kind: kindOf(body),
    heading: opts.uploadName,
    text: body,
    themes: themesFor(body),
    links: [],
    images: [],
    post_url: "",
    upload_id: uploadId,
    upload_name: opts.uploadName,
  };
  const all = [...sigs, signal];
  writeSignals(all);

  // Update the managed record only (curated experts keep their engine record untouched).
  if (!curated) {
    const idx = managed.findIndex((e) => e.id === id);
    const updated = recompute(id!, all, { name, blurb: rec?.blurb ?? opts.blurb ?? "", url: rec?.url ?? "", category: rec?.category ?? opts.category });
    if (idx >= 0) managed[idx] = updated; else managed.push(updated);
    writeExperts(managed);
  }
  clearCache();
  return { id, name, uploadId, added: 1, total: existing + 1, themes: signal.themes };
}

// Update a managed profile's name/blurb (and propagate the name onto its signals).
export function updateProfile(id: string, name: string, blurb: string) {
  const experts = readExperts();
  const target = experts.find((e) => e.id === id);
  if (!isManaged(target)) throw new Error("Not an editable profile.");
  const sigs = readSignals();
  let changed = false;
  for (const s of sigs) if (s.source_id === id && s.source !== name) { s.source = name; changed = true; }
  if (changed) writeSignals(sigs);
  const idx = experts.findIndex((e) => e.id === id);
  experts[idx] = recompute(id, sigs, { name, blurb, url: target!.url }); // preserve feed URL
  writeExperts(experts);
  clearCache();
}

// --- minimal RSS/Atom parsing (server-side) ---
type FeedItem = { title: string; link: string; date: string; content: string };
function parseFeed(xml: string): FeedItem[] {
  const blocks = xml.split(/<(?:item|entry)[\s>]/i).slice(1);
  const items: FeedItem[] = [];
  for (const b of blocks) {
    const pick = (re: RegExp) => (b.match(re)?.[1] ?? "").trim();
    const title = htmlToText(pick(/<title[^>]*>([\s\S]*?)<\/title>/i));
    if (!title) continue;
    const link = pick(/<link>([\s\S]*?)<\/link>/i) || (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const date = pick(/<(?:pubDate|published|updated|dc:date)>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i);
    const content = pick(/<content:encoded>([\s\S]*?)<\/content:encoded>/i)
      || pick(/<content[^>]*>([\s\S]*?)<\/content>/i)
      || pick(/<(?:description|summary)[^>]*>([\s\S]*?)<\/(?:description|summary)>/i);
    items.push({ title, link, date, content });
  }
  return items;
}
function toISO(d: string): string {
  const t = Date.parse(d);
  return Number.isNaN(t) ? new Date().toISOString().slice(0, 10) : new Date(t).toISOString().slice(0, 10);
}

// Add an RSS/Atom feed as a managed source (or attach to an existing author/publication).
export async function addFeed(opts: { id?: string; name?: string; blurb?: string; feedUrl: string; silent?: boolean; category?: Category }): Promise<{ id: string; name: string; added: number }> {
  const experts = readExperts();
  const existing = opts.id ? experts.find((e) => e.id === opts.id) : undefined;
  // attaching a feed to an existing CURATED expert: append signals only, no managed record
  const curated = !!opts.id && !existing && !!getExpert(opts.id!);

  const res = await fetch(opts.feedUrl, { headers: { "User-Agent": "jotter-intelligence/1.0" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Feed returned ${res.status}.`);
  const xml = await res.text();
  const items = parseFeed(xml).filter((it) => htmlToText(it.content).length > 40).slice(0, 30);
  if (!items.length) throw new Error("No readable items found in that feed.");

  const channelTitle = htmlToText((xml.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")).slice(0, 80);
  const name = (existing?.name || (curated ? getExpert(opts.id!)?.name : "") || opts.name?.trim() || channelTitle || "Feed").slice(0, 80);
  const id = opts.id || `doc-${slugify(name)}`;

  const sigs = readSignals();
  const have = new Set(sigs.filter((s) => s.source_id === id).map((s) => s.post_url));
  const fresh: Signal[] = [];
  for (const it of items) {
    if (it.link && have.has(it.link)) continue;
    const body = paragraphize(htmlToText(it.content));
    if (body.length < 40) continue;
    const date = toISO(it.date);
    fresh.push({
      id: `${id}-${slugify(it.link || it.title)}`,
      post_id: it.link || it.title,
      date, year: Number(date.slice(0, 4)),
      source: name, source_id: id, type: "article", kind: kindOf(body),
      heading: it.title, text: body, themes: themesFor(it.title + " " + body),
      links: [], images: [], post_url: it.link,
    });
  }
  if (!fresh.length) {
    if (opts.silent) return { id, name, added: 0 }; // refresh: nothing new is fine
    throw new Error("Nothing new to add from that feed.");
  }

  const all = [...sigs, ...fresh];
  writeSignals(all);
  if (!curated) { // managed feed source keeps an editable record; curated experts don't
    const rec = recompute(id, all, { name, blurb: existing?.blurb || opts.blurb || `RSS feed · ${opts.feedUrl}`, url: opts.feedUrl, category: existing?.category || opts.category });
    const idx = experts.findIndex((e) => e.id === id);
    if (idx >= 0) experts[idx] = rec; else experts.push(rec);
    writeExperts(experts);
  }
  clearCache();
  return { id, name, added: fresh.length };
}

// Re-fetch every in-app RSS feed source and append new items (dedup by URL). Best-effort.
export async function refreshFeeds(): Promise<{ source: string; added: number }[]> {
  const feeds = readExperts().filter((e) => e.uploaded && /^https?:\/\//i.test(e.url || ""));
  const out: { source: string; added: number }[] = [];
  for (const f of feeds) {
    try {
      const r = await addFeed({ id: f.id, feedUrl: f.url, silent: true });
      out.push({ source: f.name, added: r.added });
    } catch {
      out.push({ source: f.name, added: 0 });
    }
  }
  return out;
}

export type UploadRef = { upload_id: string; upload_name: string; chunks: number; date: string };
export function listUploads(expertId: string): UploadRef[] {
  const map = new Map<string, UploadRef>();
  for (const s of readSignals()) {
    if (s.source_id !== expertId || !s.upload_id) continue;
    const cur = map.get(s.upload_id);
    if (cur) cur.chunks += 1;
    else map.set(s.upload_id, { upload_id: s.upload_id, upload_name: s.upload_name ?? "document", chunks: 1, date: s.date.slice(0, 10) });
  }
  return [...map.values()];
}

// Delete one uploaded PDF/feed-batch (its signals). Works for managed profiles AND for
// uploads attached to a curated expert (those signals still live in the uploads store).
export function deleteUpload(expertId: string, uploadId: string) {
  const experts = readExperts();
  const target = experts.find((e) => e.id === expertId);
  if (!target && !getExpert(expertId)) throw new Error("Unknown profile.");
  const remaining = readSignals().filter((s) => !(s.source_id === expertId && (s.upload_id === uploadId || s.id === uploadId)));
  writeSignals(remaining);
  if (isManaged(target)) {
    const idx = experts.findIndex((e) => e.id === expertId);
    experts[idx] = recompute(expertId, remaining, { name: target!.name, blurb: target!.blurb, url: target!.url, category: target!.category });
    writeExperts(experts);
  }
  clearCache();
}

// Delete an entire uploaded profile and all its signals.
export function deleteProfile(expertId: string) {
  const experts = readExperts();
  const target = experts.find((e) => e.id === expertId);
  if (!isManaged(target)) throw new Error("Not an uploaded profile.");
  writeSignals(readSignals().filter((s) => s.source_id !== expertId));
  writeExperts(experts.filter((e) => e.id !== expertId));
  clearCache();
}

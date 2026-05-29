import { NextRequest, NextResponse } from "next/server";
import { searchSignals, type Signal } from "@/lib/data";

const FORMAT_LABEL: Record<string, string> = {
  brief: "Foresight brief",
  pov: "Thought-leadership POV",
  cards: "Trend cards",
};

const FORMAT_AI: Record<string, string> = {
  pov: "a punchy 600-word thought-leadership Point of View article for LinkedIn, in a confident, intelligent voice",
  brief: "a structured client foresight brief with: a one-line thesis, 3-4 key signals, what it means for culture/society/business, and signposts to watch",
  cards: "a set of 5 'trend cards', each with a title, a 2-sentence description, evidence, and a 'so what for business' line",
};

function retrieve(topic: string): Signal[] {
  const long = searchSignals(topic, { type: "longread", limit: 16 }).results;
  const note = searchSignals(topic, { type: "commonplace", limit: 8 }).results;
  const quote = searchSignals(topic, { type: "quote", limit: 8 }).results;
  const any = searchSignals(topic, { limit: 14 }).results;
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (const s of [...long, ...note, ...quote, ...any]) {
    if (!seen.has(s.id)) { seen.add(s.id); out.push(s); }
    if (out.length >= 28) break;
  }
  return out;
}

// Clean, finish-elsewhere research document.
function buildPack(topic: string, format: string, sigs: Signal[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const commentary = sigs.filter((s) => ["longread", "commonplace", "linkblog", "note", "chart", "feedback"].includes(s.type));
  const quotes = sigs.filter((s) => s.type === "quote");
  const books = sigs.filter((s) => s.type === "book");

  const L: string[] = [];
  L.push(`# Research Report — ${topic}`);
  L.push("");
  L.push(`*Compiled by Jotter Intelligence · ${today} · ${sigs.length} signals · expert: John Naughton (Memex 1.1)*`);
  L.push(`*Intended output: ${FORMAT_LABEL[format] ?? "Foresight brief"}*`);
  L.push("");
  L.push("---");

  if (commentary.length) {
    L.push("");
    L.push("## Commentary & long reads");
    for (const s of commentary) {
      L.push("");
      L.push(`### ${s.heading}`);
      L.push(`*${s.date.slice(0, 10)} · ${s.type}*`);
      L.push("");
      L.push(s.text);
      if (s.links.length) {
        L.push("");
        L.push("Sources he linked:");
        for (const l of s.links) L.push(`- [${l.anchor || l.domain}](${l.url})`);
      }
      L.push("");
      L.push(`[Original post](${s.post_url})`);
      L.push("");
      L.push("---");
    }
  }

  if (quotes.length) {
    L.push("");
    L.push("## Quotes");
    for (const s of quotes) {
      L.push(`> ${s.text}`);
      L.push(`> — *${s.date.slice(0, 10)}*`);
      L.push("");
    }
    L.push("---");
  }

  if (books.length) {
    L.push("");
    L.push("## Books he flagged");
    for (const s of books) {
      L.push(`- **${s.heading}** — ${s.text.slice(0, 200)} ([post](${s.post_url}))`);
    }
  }

  return L.join("\n");
}

export async function POST(request: NextRequest) {
  const { topic, format = "brief" } = await request.json();
  if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const sigs = retrieve(topic);
  const key = process.env.ANTHROPIC_API_KEY;

  // Default: clean research report to finish elsewhere (no AI / no paid API).
  if (!key) {
    return NextResponse.json({
      markdown: buildPack(topic, format, sigs),
      mode: "pack",
      count: sigs.length,
      filename: `jotter-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.md`,
    });
  }

  // Optional: if a key is ever configured, synthesise the finished piece.
  const evidence = sigs
    .map((s, i) => `[${i + 1}] ${s.date.slice(0, 10)} — ${s.heading}\n${s.text.slice(0, 600)}\nSource: ${s.post_url}`)
    .join("\n\n");
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: key });
  const sys = `You are the foresight analyst for Jotter, a strategy & thought-leadership studio.
Ground EVERY claim in the supplied signals, cite inline like [1]. Be specific. Distinguish
structural convictions from live signals. Note this is one lens (John Naughton). Output clean Markdown.`;
  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    system: sys,
    messages: [{ role: "user", content: `Topic: ${topic}\n\nProduce ${FORMAT_AI[format] ?? FORMAT_AI.brief}.\n\nSIGNALS:\n${evidence}` }],
  });
  const markdown = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  return NextResponse.json({ markdown, mode: "ai", count: sigs.length, filename: `jotter-${topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.md` });
}

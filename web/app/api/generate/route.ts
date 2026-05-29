import { NextRequest, NextResponse } from "next/server";
import { searchSignals, type Signal } from "@/lib/data";

const FORMATS: Record<string, string> = {
  pov: "a punchy 600-word thought-leadership Point of View article for LinkedIn, in a confident, intelligent voice",
  brief: "a structured client foresight brief with: a one-line thesis, 3-4 key signals, what it means for culture/society/business, and signposts to watch",
  cards: "a set of 5 'trend cards', each with a title, a 2-sentence description, evidence, and a 'so what for business' line",
};

function retrieve(topic: string): Signal[] {
  // prefer his commentary-bearing atoms
  const long = searchSignals(topic, { type: "longread", limit: 14 }).results;
  const note = searchSignals(topic, { type: "commonplace", limit: 6 }).results;
  const any = searchSignals(topic, { limit: 12 }).results;
  const seen = new Set<string>();
  const out: Signal[] = [];
  for (const s of [...long, ...note, ...any]) {
    if (!seen.has(s.id)) { seen.add(s.id); out.push(s); }
    if (out.length >= 22) break;
  }
  return out;
}

function evidenceBlock(sigs: Signal[]): string {
  return sigs
    .map((s, i) => {
      const links = s.links.map((l) => `${l.anchor || l.domain} (${l.url})`).join("; ");
      return `[${i + 1}] ${s.date.slice(0, 10)} — ${s.heading}\n${s.text.slice(0, 600)}${links ? `\nLinks: ${links}` : ""}\nSource: ${s.post_url}`;
    })
    .join("\n\n");
}

export async function POST(request: NextRequest) {
  const { topic, format = "brief" } = await request.json();
  if (!topic) return NextResponse.json({ error: "topic required" }, { status: 400 });

  const sigs = retrieve(topic);
  const evidence = evidenceBlock(sigs);
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key) {
    // Graceful no-key path: a real evidence pack the user can write from.
    const md = [
      `# Draft inputs: ${topic}`,
      `*Generated without an LLM key — this is the grounded evidence pack. Add ANTHROPIC_API_KEY to .env.local to auto-synthesise the ${format}.*`,
      ``,
      `**${sigs.length} relevant signals** from John Naughton, most recent first:`,
      ``,
      ...sigs.map(
        (s, i) =>
          `### ${i + 1}. ${s.heading}\n*${s.date.slice(0, 10)} · ${s.type}*\n\n${s.text.slice(0, 400)}…\n\n${s.links
            .map((l) => `- [${l.anchor || l.domain}](${l.url})`)
            .join("\n")}\n\n[source post](${s.post_url})`
      ),
    ].join("\n");
    return NextResponse.json({ markdown: md, grounded: false, count: sigs.length });
  }

  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: key });
  const sys = `You are the foresight analyst for Jotter, a strategy & thought-leadership studio.
You write grounded foresight from a curated signal stream. Right now there is ONE sensor:
John Naughton (Observer columnist, Cambridge tech-society academic — techno-skeptical, pro-democracy, historically minded).
Rules:
- Ground EVERY claim in the supplied signals. Cite inline like [1], [3].
- Be specific: name the thinkers, articles, dates he surfaced.
- Distinguish structural convictions from live/emerging signals.
- Note that this is one lens; flag where he may be biased.
- Output clean Markdown. No preamble.`;

  const msg = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 2000,
    system: sys,
    messages: [
      {
        role: "user",
        content: `Topic: ${topic}\n\nProduce ${FORMATS[format] ?? FORMATS.brief}.\n\nSIGNALS:\n${evidence}`,
      },
    ],
  });

  const markdown = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("\n");

  return NextResponse.json({ markdown, grounded: true, count: sigs.length });
}

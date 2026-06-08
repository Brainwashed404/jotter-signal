import { NextRequest, NextResponse } from "next/server";
import { extractText, getDocumentProxy } from "unpdf";
import { attachPdf, prettyName } from "@/lib/uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

// Parse a PDF date string ("D:20230914120000Z" / "D:20230914...") → YYYY-MM-DD.
function pdfDate(s: unknown): string | undefined {
  if (typeof s !== "string") return undefined;
  const m = s.match(/D:(\d{4})(\d{2})(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo}-${d}`;
  return iso <= new Date().toISOString().slice(0, 10) && y >= "1990" ? iso : undefined;
}

async function pdfToTextAndDate(buf: ArrayBuffer): Promise<{ text: string; date?: string }> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  let date: string | undefined;
  try {
    const meta = await pdf.getMetadata();
    const info = (meta?.info ?? {}) as Record<string, unknown>;
    date = pdfDate(info.CreationDate) || pdfDate(info.ModDate);
  } catch { /* no metadata */ }
  return { text: Array.isArray(text) ? text.join("\n\n") : text, date };
}

export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }
  const file = form.get("file");
  const mode = (form.get("mode") as string) || "ground";
  const title = ((form.get("title") as string) || "").trim();
  const expertId = ((form.get("expertId") as string) || "").trim() || undefined;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No PDF uploaded." }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: "PDF too large (max 25 MB)." }, { status: 413 });
  }

  let text = "", pubDate: string | undefined;
  try {
    const r = await pdfToTextAndDate(await file.arrayBuffer());
    text = r.text; pubDate = r.date;
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read that PDF: ${(e as Error).message}` }, { status: 422 });
  }
  text = text.trim();
  if (text.replace(/\s/g, "").length < 60) {
    return NextResponse.json({ error: "No extractable text found (the PDF may be scanned images)." }, { status: 422 });
  }

  const docTitle = title || prettyName(file.name);

  // One-off grounding: just hand the text back for the next question.
  if (mode === "ground") {
    return NextResponse.json({ mode: "ground", title: docTitle, chars: text.length, text: text.slice(0, 40000) });
  }

  // Archive: attach to an existing profile (expertId) or create one named after the doc.
  const category = ((form.get("category") as string) || "") === "publication" ? "publication" : "author";
  try {
    const r = attachPdf({ expertId, name: docTitle, uploadName: docTitle, text, date: pubDate, category });
    return NextResponse.json({ mode: "archive", title: r.name, sourceId: r.id, signals: r.added, total: r.total, themes: r.themes, date: pubDate });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

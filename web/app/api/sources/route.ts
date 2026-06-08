import { NextRequest, NextResponse } from "next/server";
import { addFeed, updateProfile, deleteProfile, deleteUpload } from "@/lib/uploads";

export const runtime = "nodejs";

// POST handles three actions:
//   { feedUrl, name?, blurb?, category?, id? }  → add an RSS feed (new source, or attach to id)
//   { id, name, blurb }                         → save (update) an existing profile's details
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  if (body.feedUrl) {
    if (!/^https?:\/\//i.test(body.feedUrl)) {
      return NextResponse.json({ error: "Enter a valid feed URL (http/https)." }, { status: 400 });
    }
    try {
      const r = await addFeed({ id: body.id, name: body.name, blurb: body.blurb, category: body.category, feedUrl: body.feedUrl.trim() });
      return NextResponse.json(r);
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  if (body.id) {
    if (!body.name || !String(body.name).trim()) {
      return NextResponse.json({ error: "A profile name is required." }, { status: 400 });
    }
    try {
      updateProfile(body.id, String(body.name).trim(), String(body.blurb || "").trim());
      return NextResponse.json({ ok: true });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "feedUrl or id required" }, { status: 400 });
}

// Delete a whole profile (?id=) or a single uploaded PDF (?id=&upload=).
export async function DELETE(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get("id");
  const upload = sp.get("upload");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    if (upload) deleteUpload(id, upload);
    else deleteProfile(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

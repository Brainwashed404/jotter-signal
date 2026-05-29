import { NextRequest, NextResponse } from "next/server";
import { searchSignals } from "@/lib/data";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const type = sp.get("type") ?? undefined;
  const theme = sp.get("theme") ?? undefined;
  const offset = parseInt(sp.get("offset") ?? "0", 10) || 0;
  const limit = 30;
  const { results, total } = searchSignals(q, { type, theme, limit, offset });
  return NextResponse.json({ results, total, offset, limit });
}

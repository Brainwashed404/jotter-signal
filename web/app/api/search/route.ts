import { NextRequest, NextResponse } from "next/server";
import { searchSignals } from "@/lib/data";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const type = sp.get("type") ?? undefined;
  const theme = sp.get("theme") ?? undefined;
  const { results, total } = searchSignals(q, { type, theme, limit: 40 });
  return NextResponse.json({ results, total });
}

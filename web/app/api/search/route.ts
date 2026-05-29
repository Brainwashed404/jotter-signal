import { NextRequest, NextResponse } from "next/server";
import { searchSignals, type SortMode } from "@/lib/data";

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const type = sp.get("type") ?? undefined;
  const theme = sp.get("theme") ?? undefined;
  const sort = (sp.get("sort") as SortMode) || undefined;
  const years = (sp.get("years") ?? "")
    .split(",")
    .map((y) => parseInt(y, 10))
    .filter((y) => !Number.isNaN(y));
  const offset = parseInt(sp.get("offset") ?? "0", 10) || 0;
  const limit = 30;
  const { results, total } = searchSignals(q, { type, theme, years, sort, limit, offset });
  return NextResponse.json({ results, total, offset, limit });
}

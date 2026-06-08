import { NextResponse } from "next/server";

// Data is now refreshed nightly via GitHub Actions (engine/refresh_all.py).
// This endpoint is kept as a no-op so any cached client references don't 404.
export async function POST() {
  return NextResponse.json({ refreshed: false, reason: "noop: data refreshed by scheduled action" });
}

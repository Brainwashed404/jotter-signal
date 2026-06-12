import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";
import { refreshFeeds } from "@/lib/uploads";

const g = globalThis as unknown as { __refreshing?: boolean };

function runScript(engineDir: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("python3", args, { cwd: engineDir, stdio: "pipe" });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

export async function POST() {
  // In production, DATA_URL is set and data is refreshed by GitHub Actions.
  if (process.env.DATA_URL) {
    return NextResponse.json({ refreshed: false });
  }
  // Prevent concurrent refreshes.
  if (g.__refreshing) {
    return NextResponse.json({ refreshed: false, reason: "in-progress" });
  }
  g.__refreshing = true;
  try {
    const engineDir = path.join(process.cwd(), "..", "engine");
    await runScript(engineDir, ["fetch_naughton_recent.py"]);
    await runScript(engineDir, ["fetch_expert.py"]);
    await runScript(engineDir, ["backfill.py", "lsn"]);
    await runScript(engineDir, ["build_dataset.py"]);
    // Also refresh any in-app RSS feed sources (the separate uploads store).
    const feeds = await refreshFeeds().catch(() => []);
    return NextResponse.json({ refreshed: true, feeds });
  } catch {
    return NextResponse.json({ refreshed: false });
  } finally {
    g.__refreshing = false;
  }
}

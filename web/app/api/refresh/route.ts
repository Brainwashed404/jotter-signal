import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { clearCache } from "@/lib/data";

const run = promisify(execFile);

const THROTTLE_MIN = 20; // only actually re-fetch at most this often
const STAMP = path.join(process.cwd(), "data", ".last_refresh");
const ENGINE = path.join(process.cwd(), "..", "engine");

export async function POST() {
  // throttle
  try {
    const last = parseInt(fs.readFileSync(STAMP, "utf8"), 10) || 0;
    if (Date.now() - last < THROTTLE_MIN * 60_000) {
      return NextResponse.json({ refreshed: false, reason: "fresh" });
    }
  } catch {
    /* no stamp yet */
  }
  // write stamp first so concurrent loads don't double-run
  try {
    fs.writeFileSync(STAMP, String(Date.now()));
  } catch {
    return NextResponse.json({ refreshed: false, reason: "readonly" });
  }

  try {
    await run("bash", ["-lc", "python3 fetch_expert.py && python3 build_dataset.py"], {
      cwd: ENGINE,
      timeout: 180_000,
      maxBuffer: 1024 * 1024 * 16,
    });
    clearCache();
    return NextResponse.json({ refreshed: true });
  } catch (e) {
    return NextResponse.json({ refreshed: false, reason: "error", detail: String(e).slice(0, 200) });
  }
}

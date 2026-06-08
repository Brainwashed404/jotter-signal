#!/usr/bin/env node
// Runs before `next build` to download the latest data files from remote storage.
// This means B2/R2 is only hit once per Vercel build, not on every user request.
// The files are then bundled into the serverless function via outputFileTracingIncludes.

const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const DATA_URL = process.env.DATA_URL?.replace(/\/$/, "");

if (!DATA_URL) {
  console.log("[fetch-data] No DATA_URL set — skipping (local dev mode)");
  process.exit(0);
}

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function download(src, dest) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(src);
    const client = parsed.protocol === "https:" ? https : http;
    const file = fs.createWriteStream(dest);
    console.log(`[fetch-data] ${src} → ${path.basename(dest)}`);
    client
      .get(src, (res) => {
        if (res.statusCode !== 200) {
          fs.unlink(dest, () => {});
          reject(new Error(`HTTP ${res.statusCode} fetching ${src}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            const bytes = fs.statSync(dest).size;
            console.log(`[fetch-data] ✓ ${path.basename(dest)} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
            resolve();
          });
        });
      })
      .on("error", (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
  });
}

(async () => {
  try {
    await Promise.all([
      download(`${DATA_URL}/signals.jsonl.gz`, path.join(DATA_DIR, "signals.jsonl.gz")),
      download(`${DATA_URL}/experts.json`, path.join(DATA_DIR, "experts.json")),
    ]);
    console.log("[fetch-data] Done — data files bundled into build");
  } catch (err) {
    // Don't fail the build — the app handles missing/stale data gracefully.
    console.warn("[fetch-data] Warning: could not fetch data files:", err.message);
    console.warn("[fetch-data] Build will continue with existing/empty data");
  }
})();

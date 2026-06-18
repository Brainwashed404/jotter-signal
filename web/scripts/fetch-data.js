#!/usr/bin/env node
// Runs before `next build` to download the latest data files from remote storage.
// This means B2/R2 is only hit once per Vercel build, not on every user request.
// The files are then bundled into the serverless function via outputFileTracingIncludes.
//
// If the download fails (e.g. bandwidth cap exceeded), any pre-existing file is
// kept intact so the build can still use committed/cached data.

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
  const tmp = dest + ".tmp";
  return new Promise((resolve, reject) => {
    const parsed = new URL(src);
    const client = parsed.protocol === "https:" ? https : http;
    console.log(`[fetch-data] ${src} → ${path.basename(dest)}`);
    client
      .get(src, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} fetching ${src}`));
          return;
        }
        const file = fs.createWriteStream(tmp);
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.renameSync(tmp, dest); // atomic replace — only overwrites on success
            const bytes = fs.statSync(dest).size;
            console.log(`[fetch-data] ✓ ${path.basename(dest)} (${(bytes / 1024 / 1024).toFixed(1)} MB)`);
            resolve();
          });
        });
        file.on("error", (err) => { fs.unlink(tmp, () => {}); reject(err); });
      })
      .on("error", (err) => { fs.unlink(tmp, () => {}); reject(err); });
  });
}

(async () => {
  // The committed data files (web/data/signals.jsonl.gz + experts.json) are the
  // SOURCE OF TRUTH for the deployed app. The CI "Data refresh" workflow commits a
  // freshly-rebuilt copy every run (and local builds can be committed directly), so
  // they're never more than a refresh cycle stale. We deliberately PREFER them over a
  // remote (B2) download: the B2 free-tier cap / lag repeatedly served stale data
  // (e.g. a removed source like Benedict Evans reappearing, or a new expert missing),
  // because a successful B2 download would overwrite the good committed file. Only
  // fall back to B2 if a healthy committed file is absent.
  const sigPath = path.join(DATA_DIR, "signals.jsonl.gz");
  const expPath = path.join(DATA_DIR, "experts.json");
  // Health floor must sit BELOW the real committed size or the build silently falls back to
  // stale B2 data. The 200-post recency cap dropped the committed gz from ~26 MB to ~2.3 MB,
  // which slipped under the old 5 MB floor — so every deploy was downloading stale B2 data
  // (old 26k build, removed sources like Benedict Evans resurfacing). 1 MB cleanly passes a
  // healthy capped build (~2.3 MB) while still rejecting a broken/empty gz (<100 KB).
  const committedOk =
    fs.existsSync(sigPath) && fs.statSync(sigPath).size > 1 * 1024 * 1024 && fs.existsSync(expPath);
  if (committedOk) {
    const mb = (fs.statSync(sigPath).size / 1024 / 1024).toFixed(1);
    console.log(`[fetch-data] Using committed data (authoritative, ${mb} MB) — skipping remote download`);
    return;
  }
  console.log("[fetch-data] No healthy committed data file — falling back to remote download");
  try {
    await Promise.all([
      download(`${DATA_URL}/signals.jsonl.gz`, path.join(DATA_DIR, "signals.jsonl.gz")),
      download(`${DATA_URL}/experts.json`, path.join(DATA_DIR, "experts.json")),
    ]);
    console.log("[fetch-data] Done — data files bundled into build");
  } catch (err) {
    // Don't fail the build. If a pre-existing file is present (e.g. committed to
    // git), the build will use that. Otherwise the app serves an empty state.
    console.warn("[fetch-data] Warning: could not fetch fresh data:", err.message);
    const hasGz = fs.existsSync(path.join(DATA_DIR, "signals.jsonl.gz"));
    console.warn(`[fetch-data] ${hasGz ? "Using existing committed data file" : "No fallback — app will show empty state"}`);
  }
})();

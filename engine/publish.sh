#!/usr/bin/env bash
# Local publish — the "blend".
#
# Fetches every source on THIS machine (your home/residential IP, which Substack
# does NOT block), rebuilds the dataset, uploads it to storage, and triggers a
# site rebuild. This is how blocked *.substack.com feeds (Gary Marcus etc.) get
# in: the request never comes from a datacenter, so it's never 403'd.
#
# One-time setup: create engine/.env with your storage key (see engine/.env.example).
#
# Usage:
#   bash engine/publish.sh                          # refresh all (RSS only, fast)
#   bash engine/publish.sh --ids garymarcus         # only this source
#   bash engine/publish.sh --backfill --ids garymarcus,profgmarkets   # + deep archive
#   bash engine/publish.sh --backfill               # full deep refresh of everything
set -euo pipefail
cd "$(dirname "$0")"          # engine/
ROOT="$(cd .. && pwd)"

# --- credentials (engine/.env, git-ignored) ---
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${B2_KEY_ID:?Missing B2_KEY_ID — copy engine/.env.example to engine/.env and fill it in}"
: "${B2_APP_KEY:?Missing B2_APP_KEY — copy engine/.env.example to engine/.env and fill it in}"
ENDPOINT="${B2_ENDPOINT:-https://s3.us-east-005.backblazeb2.com}"
BUCKET="${B2_BUCKET:-jotter-data}"

# --- ensure aws CLI is available (one-time auto-install) ---
if ! command -v aws >/dev/null 2>&1; then
  echo "→ installing awscli (one-time)…"
  python3 -m pip install --quiet --user awscli
  export PATH="$PATH:$(python3 -m site --user-base)/bin"
  command -v aws >/dev/null 2>&1 || { echo "aws still not found — run: python3 -m pip install awscli"; exit 1; }
fi

# --- parse flags: default to fast (no backfill); --backfill enables deep archive ---
BACKFILL_FLAG="--no-backfill"
ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --backfill) BACKFILL_FLAG="";;
    *) ARGS+=("$1");;
  esac
  shift
done

echo "→ fetching + building locally (your IP — Substack works here)…"
python3 refresh_all.py $BACKFILL_FLAG ${ARGS[@]+"${ARGS[@]}"}

# Refresh the baked Reddit headlines (Reddit blocks Vercel/CI, so it's fetched here).
echo "→ refreshing Reddit headlines…"
python3 fetch_reddit.py || echo "  (reddit fetch skipped — keeping existing)"

# --- upload rebuilt data to storage ---
echo "→ uploading to storage…"
export AWS_ACCESS_KEY_ID="$B2_KEY_ID" AWS_SECRET_ACCESS_KEY="$B2_APP_KEY"
gzip -kf "$ROOT/web/data/signals.jsonl"
aws s3 cp "$ROOT/web/data/signals.jsonl.gz" "s3://$BUCKET/signals.jsonl.gz" --endpoint-url "$ENDPOINT"
aws s3 cp "$ROOT/web/data/experts.json"     "s3://$BUCKET/experts.json"     --endpoint-url "$ENDPOINT"
# Persist raw+archive so CI stays in sync and never clobbers locally-fetched data.
tar czf "$ROOT/engine-data.tar.gz" -C "$ROOT/engine" data
aws s3 cp "$ROOT/engine-data.tar.gz" "s3://$BUCKET/engine-data.tar.gz" --endpoint-url "$ENDPOINT"

# --- trigger the site rebuild ---
echo "→ triggering site rebuild…"
cd "$ROOT"
git add web/lib/reddit-trending.json 2>/dev/null || true
git commit --allow-empty -m "data: local publish $(date -u +%FT%TZ)" >/dev/null
git push >/dev/null

echo "✓ Published. The site will rebuild with the fresh data in ~1-2 minutes."

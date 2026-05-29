# Jotter Signal — Foresight Engine

Turning the world's sharpest minds into thought leadership, insight and foresight.

A foresight engine that ingests curated thinkers ("sensors"), atomises what they
surface into time-stamped **signals**, detects patterns across them (**insights**),
and generates client-ready **foresight**.

**Sensor #1:** John Naughton — *Memex 1.1* (13,056 posts, 2002–2026).

## Architecture

```
engine/   Python pipeline: scrape → atomise → enrich → build dataset
  fetch_meta.py     lightweight metadata for all posts (WordPress REST API)
  fetch_full.py     full content for all posts
  build_dataset.py  posts -> structured signals + radar aggregates
  analyze.py        ad-hoc trajectory / source analysis
  data/             raw scrape (git-ignored)

web/      Next.js 16 app — the product
  app/              Radar (/) · Workbench (/search) · Generator (/generate) · Sensors (/sources)
  lib/data.ts       loads signals + search
  data/             radar.json (committed) · signals.jsonl (git-ignored, regenerate)
```

### The four surfaces
- **Radar** — theme momentum across 24 years + the information-diet shift.
- **Workbench** — search every atom, filter by type/theme, cited to source.
- **Generator** — produce a foresight brief / POV / trend cards, grounded & cited.
- **Sensors** — manage curated minds (more sensors = stronger corroboration signal).

## Run locally

```bash
# 1. Build the dataset (first time, ~2 min — polite scrape)
cd engine
python3 fetch_full.py        # mirrors all posts -> data/posts_full.jsonl
python3 build_dataset.py     # -> web/data/signals.jsonl + radar.json

# 2. Run the app
cd ../web
npm install
npm run dev                  # http://localhost:3000
```

### Enable LLM synthesis (Generator)
Create `web/.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```
Without a key the Generator returns a grounded *evidence pack*; with one it
synthesises the finished artifact with **Claude Opus 4.8**, fully cited.

## Roadmap
- Add more sensors (RSS-based ingestion) → cross-source **convergence** detection
- Scheduled ingestion for near-real-time trend tracking
- Semantic (vector) search + RAG chat on the Workbench
- Weekly "Signals → Insights" digest
- Deploy to jotter.media

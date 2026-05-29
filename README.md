# Jotter Intelligence — Foresight Engine

Turning the world's sharpest minds into thought leadership, insight and foresight.

A foresight engine that ingests curated thinkers ("experts"), atomises what they
surface into time-stamped **signals**, detects patterns across them (**insights**),
and generates client-ready **foresight**.

**Expert #1:** John Naughton — *Memex 1.1* (13,056 posts, 2002–2026).

## Architecture

```
engine/   Python pipeline: scrape → atomise → enrich → build dataset
  fetch_meta.py     lightweight metadata for all posts (WordPress REST API)
  fetch_full.py     full content for all posts
  build_dataset.py  posts -> structured signals + radar aggregates
  analyze.py        ad-hoc trajectory / source analysis
  data/             raw scrape (git-ignored)

web/      Next.js 16 app — the product
  app/              Latest (/) · Search (/search) · Reports (/generate) · Experts (/sources)
  lib/data.ts       loads signals + search
  data/             radar.json (committed) · signals.jsonl (git-ignored, regenerate)
```

### The surfaces
- **Latest** — reverse-chron reading feed of what experts are surfacing.
- **Search** — search every atom, filter by type/theme/year, sort by date, cited to source.
- **Reports** — produce a grounded, cited research report (brief / POV / trend cards).
- **Experts** — manage curated minds; each profile shows theme momentum + information diet.
- **Saved** — pinned entries and highlighted excerpts with annotations.

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

### Enable LLM synthesis (Reports)
Create `web/.env.local`:
```
ANTHROPIC_API_KEY=sk-ant-...
```
Without a key Reports returns a grounded *research report* (evidence compiled from
the archive); with one it synthesises the finished artifact with **Claude Opus 4.8**, fully cited.

## Roadmap
- Add more experts (RSS-based ingestion) → cross-source **convergence** detection
- Scheduled ingestion for near-real-time trend tracking
- Semantic (vector) search + RAG chat on Search
- Weekly "Signals → Insights" digest
- Deploy to jotter.media

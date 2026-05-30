# Jotter Intelligence — project handoff (read this first)

A foresight engine: ingest curated experts → atomise into time-stamped **signals**
→ surface insight (themes, momentum, cross-expert convergence, extracted stats)
→ generate cited research reports. Local-first; not yet deployed.

- **Repo:** github.com/Brainwashed404/jotter-signal (private). **Local:** `~/Claude Code Experiments/memex-foresight`
- **Run the app:** `cd web && npm run dev` → http://localhost:3000
- **Rebuild data:** `cd engine && python3 build_dataset.py`
- Scale today: **20 experts, ~23.5k signals**.

## Layout
```
engine/                      Python pipeline (no deps beyond stdlib)
  experts.json               source config (THE place to add experts)
  fetch_meta.py/fetch_full.py  Naughton WordPress scrape -> data/posts_full.jsonl
  fetch_expert.py            pull recent RSS/Atom for each rss expert -> data/raw_<id>.jsonl
  backfill.py                deep archive per source -> data/archive_<id>.jsonl
  build_dataset.py           atomise + merge everything -> web/data/{signals.jsonl,experts.json}
  data/                      raw + archive jsonl (git-ignored)
web/                         Next.js 16 app (App Router, Turbopack, Tailwind v4)
  app/                       routes (see Surfaces)
  components/                SignalCard, SignalList, Generator, Logo, ThemeToggle, ui
  lib/data.ts                server-only: load signals, search, weeklyBriefing, getExperts/getExpert/getOverview
  lib/{types,saved,themes,format}.ts
  data/                      signals.jsonl (git-ignored) + experts.json (committed)
```

## Data flow
`fetch_* / backfill.py` write raw+archive jsonl → `build_dataset.py` atomises each
source (Naughton: parse his H2 sections into typed signals; everyone else: one
`article` signal per post), strips cruft, converts `<a>`→markdown links, computes
per-expert aggregates → writes `web/data/signals.jsonl` (all signals) + `experts.json`
(per-expert stats/themes). The app reads those (cached in globalThis; **restart dev
after a rebuild** to clear the cache).

## Adding an expert (engine/experts.json)
Each entry: `{id, name, blurb, url, adapter, feed?, backfill?, cap?, category?, wpcom?, wp?}`
- `adapter:"rss"` → ongoing via `feed` (RSS or Atom). `adapter:"naughton"` is special.
- `backfill` (deep archive): `"wordpress"` (wp-json, needs `url` base), `"wpcom"`
  (WordPress.com public API, needs `wpcom:"site.com"`), `"substack"` (archive API),
  `"protein"` (tag-page scrape), `"lsn"` (daily-index scrape, recent-only), or none.
- `cap` bounds backfill size. `category` filters an RSS feed to one section (Semafor→Technology).
Then: `python3 fetch_expert.py <id>` and/or `python3 backfill.py <id>`, then `build_dataset.py`, then rebuild web.

## Experts (20)
naughton (J.Naughton, 2002→, full WP archive), doctorow (Pluralistic 600), digitalnative,
jasminesun, goodinternet (RSS-only), noahpinion, peoplevsalgorithms, resobscura, rushkoff,
zine, trendreport (Kyle Chayka), protein (SEEDS tag-scrape 2016→), futurism (capped 1500),
semafor (Tech vertical only, recent), theoverspill (Charles Arthur, wpcom 800), neural
(RSS-only), enlightenmentecon (Diane Coyle 2015-21), booktwo (James Bridle 2006→), netwars,
lsn (LS:N Daily Signals — recent-only, accumulates per run).

## Surfaces (web/app)
- `/` Home **dashboard**: weeklyBriefing(7) → movers (theme momentum vs prior 4wks),
  cross-expert convergence, stats extracted from article text. (Not a feed.)
- `/latest` the infinite-scroll signal feed.
- `/search` SignalList: full-text search, infinite scroll, filters (type tabs, theme,
  multi-year, multi-expert), date sort, X-to-clear, "In the news now" trending headlines
  (BBC/Guardian/TechCrunch/WIRED/NYT via /api/trending) that pivot to archive search.
- `/generate` **Reports**: build from a topic OR from the **report basket** (saved signals
  + highlights). No key → cited markdown doc; with `ANTHROPIC_API_KEY` in web/.env.local →
  Claude Opus synthesises. Download .md.
- `/sources` compact expert grid; `/sources/[id]` profile = theme momentum + full feed.
- `/saved` two tabs: pinned **Entries** + **Highlights** (excerpt + annotation, auto theme-tagged).

## Conventions / gotchas
- **Next.js 16**: read `web/node_modules/next/dist/docs` before non-trivial Next work; `searchParams`/`params` are async; no regex `/s` flag (use `[\s\S]`).
- Dates: **UK format** everywhere via `lib/format.ts fmtDate` ("29 May 2026").
- Inline links: body text stores markdown `[text](url)`; SignalCard renders them; `demd()` strips for previews/stat-extraction.
- Client features (pins, highlights, report basket, tags, theme) live in **localStorage** (`lib/saved.ts`). Moves server-side when a DB is added.
- Palette in `web/app/globals.css`: light bg `#fcfdf2`, accent gold `#e3bb4e`, link teal `#8acbb0`. Logo = concentric circles (`components/Logo.tsx`, `app/icon.svg`).
- `/api/refresh` re-pulls RSS + rebuilds on load (throttled 20min); **backfills are NOT in it** (manual).
- Cruft strippers in build_dataset: `strip_feed_cruft` (share buttons/read-time), `strip_pluralistic` (Doctorow template), CTA stripper (Naughton subscribe footer), Protein/SEEDS chrome.

## OUTSTANDING TODO (do these next)
1. **Strip Digital Native subscribe boilerplate** from every digitalnative post: the
   "Weekly writing about how technology and people intersect… By day I'm building Daybreak…
   If you haven't subscribed, join 70,000+ weekly readers… Subscribe now" block. Add a
   digitalnative cleanup in build_dataset (like strip_pluralistic) and rebuild. Also note the
   leading title is duplicated in the body.
2. **System-preference light/dark** with manual override: ThemeToggle/init script should
   default to `prefers-color-scheme` and only use the stored value when the user has explicitly toggled.
3. **One-command refresh-all**: a script (e.g. `engine/refresh_all.py` or npm script) that
   re-runs fetch_expert (all) + every backfill + build_dataset + (optionally) restarts. Keep it polite/rate-limited.
4. **Click-to-expand should scroll the card to the top of the viewport** for easy reading
   (SignalCard onCardClick → after setOpen(true), scrollIntoView).

## Future ideas (discussed, not built)
Expert selector on the Home dashboard; deploy to jotter.media; DB (Postgres+pgvector) to move
localStorage features server-side + enable semantic/RAG search; weekly digest email; LLM
narrative on the dashboard (key already wires Reports).

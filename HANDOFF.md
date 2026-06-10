# Jotter Intelligence — project handoff (read this first)

A foresight engine: ingest curated experts + publications → atomise into time-stamped **signals**
→ surface insight (themes, momentum, trends, extracted stats) → browse a cited **Feed**. Local-first;
not yet deployed. There is also a **radio sidebar** (internet radio player) — the app is aimed at being
a daily workbench for strategists/insight workers.

- **Repo:** github.com/Brainwashed404/jotter-signal (private). **Local:** `~/Claude Code Experiments/jotter-intelligence`
  (renamed from `memex-foresight` — package name is now `jotter-intelligence`).
- **Run the app:** `cd web && npm run dev` → http://localhost:3000
- **Rebuild data:** `cd engine && python3 build_dataset.py` (app auto-reloads on file change — see Caching)
- **One-command refresh:** `cd engine && python3 refresh_all.py` (`--no-backfill` / `--ids a,b,c`)
- Scale today: **30 sources** (authors + publications + uploads), **~25.5k signals**. Source of truth = `engine/experts.json`.
  (Bilawal Sidhu / "Map the World" was added as an author, sourced from his Substack `spatialintelligence.ai/feed` —
  the "Influences" idea was dropped: LinkedIn has no public feed + scraping breaks their ToS, so prominent voices just
  go in Experts sourced from wherever they publish openly.)
- **THE APP IS NOW 100% LLM-FREE.** All Groq/AI features were removed (Daily Intelligence, Ask/AskPanel, Generator,
  synthesis). There is **no `GROQ_API_KEY` dependency anywhere** — verify with `grep -ri groq web/app web/lib web/components`.
  Everything (Feed, trending, markets, weather, clock, calendar, topic-tracking, Wikipedia attention, sources, saved,
  radio) is deterministic. This was a deliberate decision so the app can deploy without an LLM aspect.
- **Deployment: NOT yet hosted — planned, blockers identified.** `web/data/signals.jsonl` is **~110 MB** and
  git-ignored (over GitHub's 100 MB limit), the **Python engine** must run on a schedule to refresh data, and the
  uploads store does **filesystem writes** — so pure serverless (Vercel) is a poor fit. Recommended path: a small
  always-on host (**Railway / Render / Fly.io**) with persistent disk for the data file, `next start`, and a nightly
  cron running `engine/refresh_all.py`. No env vars needed now (LLM-free). (Alt: Vercel for the app + `signals.jsonl`
  in object storage, fetched in `lib/data.ts`.) Not started — awaiting user's choice of host.
- **WRITING RULE: never use em dashes** anywhere (copy, blurbs, UI). Use commas/colons/parentheses.

## ⭐ CURRENT DEPLOYMENT & DATA PIPELINE (2026-06; supersedes older "not deployed" notes below)
**The app IS live: `intelligence.jotter.media` on Vercel** (invite-gated via middleware). Repo auto-deploys on
push to `main`.
- **Data is baked at BUILD time, not fetched at runtime.** `web/scripts/fetch-data.js` (prebuild) downloads
  `signals.jsonl.gz` + `experts.json` from object storage (env `DATA_URL`), and `next.config.ts`
  `outputFileTracingIncludes` bundles them into the serverless function. `lib/data.ts` reads the local bundled
  file (zero per-request network). Home page is ISR `export const revalidate = 300` (one render serves everyone).
  So: **new data only appears after a Vercel rebuild.** A push (even empty commit) triggers one.
- **Storage = Backblaze B2** (S3-compatible). GitHub secrets are named `R2_*` (legacy) but point at B2
  (`s3.us-east-005.backblazeb2.com`, bucket `jotter-data`). Files: `signals.jsonl.gz`, `experts.json`,
  `engine-data.tar.gz` (the raw+archive `engine/data/` dir, so runs are incremental and never re-scrape from zero).
- **CI: `.github/workflows/refresh.yml` ("Data refresh")** runs every 4h (+ manual `workflow_dispatch`, optional
  `backfill_ids=a,b,c`). Steps: restore `engine-data.tar.gz` from B2 → `refresh_all.py --no-backfill` → upload data
  back to B2 → **commit the rebuilt `web/data/signals.jsonl.gz`+`experts.json` into the repo** → push an **empty
  commit to trigger a Vercel rebuild** (`permissions: contents:write`; **no `[skip ci]`** — Vercel honours it and
  would skip the build; this workflow only triggers on schedule/dispatch so the bot push can't loop).
- **⚠⚠ THE REAL BOTTLENECK = Backblaze B2 free 1 GB/day DOWNLOAD cap.** Heavy deploy activity blows it; then the
  Vercel build's `fetch-data.js` 403s downloading `signals.jsonl.gz` AND the CI `engine-data.tar.gz` restore 403s
  (rebuilds thin, ~16k vs ~25.8k signals). Mitigations in place: (1) `fetch-data.js` falls back to the **committed**
  `web/data/signals.jsonl.gz` (force-added to git, tracked despite gitignore) when the download 403s; (2) CI commits
  fresh data to the repo each run so the build has it without a download; (3) a **degraded-build guard** in
  refresh.yml skips the publish/commit if the new signal count is far below the committed one (stops a capped thin
  run clobbering good data). **Net effect when capped: CI can't publish, so the site stays on the last good
  committed build.** Today's fixes were therefore **built locally and committed directly** (run engine locally →
  `gzip web/data/signals.jsonl` → `git add -f web/data/signals.jsonl.gz web/data/experts.json` → push).
  **DURABLE FIX (recommended, not yet done): front B2 with the user's Cloudflare** (Bandwidth-Alliance = free egress
  + caching → no cap). ~10 min one-time. Until then, treat committing local builds as the reliable update path.
- **Blocked feeds auto-handled via rss2json.** `*.substack.com` feeds 403 the CI datacenter IP (residential IPs are
  fine). `fetch_expert.py` now **falls back to `api.rss2json.com`** (a relay whose IP isn't blocked, free, no key)
  whenever a direct feed fetch fails/empties — so garymarcus, rushkoff, resobscura, rishad, whyisthisinteresting,
  trendreport refresh in CI automatically (recent ~10/feed with full bodies; deep archive still needs a local run).
  Custom-domain substacks (noahpinion.blog, profgmedia.com) were never blocked.
- **`engine/publish.sh` (local "blend")** still exists for a full local fetch+upload+deploy from a residential IP
  (creds in git-ignored `engine/.env`; template `.env.example`, `B2_KEY_ID`/`B2_APP_KEY`; auto-installs `aws`). It
  also refreshes the baked Reddit headlines (below). Use it for deep backfills of blocked substacks or when B2 is capped.
- **LSN has NO feed** — its only data source is `backfill_lsn` (scrapes `lsnglobal.com/daily-signals`, accumulates).
  `refresh_all.py` now **always runs backfill for feed-less sources** (was skipped on `--no-backfill`, which froze LSN).
- **Emailed-newsletter pipeline** (`engine/fetch_newsletters.py` + `engine/newsletter_map.json`): dedicated Gmail
  (`jotterintelligence@gmail.com`) over IMAP (secrets `GMAIL_USER`/`GMAIL_APP_PASSWORD`), one source per sender,
  grouping/category/ignore via `newsletter_map.json`, junk-subject filter, `SCHEMA_V` bump = clean re-ingest. Writes
  `data/raw_nl-*.jsonl`+`data/newsletters.json`; `build_dataset` loads the manifest alongside `experts.json`. **Mostly
  unused now** (`groups:[]`; Axios/google/KTN in `ignore_domains`) — promo emails render poorly. `fetch_expert.py`
  also supports `extra_feeds` (list) merged into one source.
- **Substack embed strip (build_dataset `clean_block`):** Substack tweet/link embeds carry escaped-JSON
  `data-attrs="…"` with raw `>` chars that broke the `<[^>]+>` stripper and leaked JSON (usernames/impressions) into
  the body (e.g. the Gary Marcus piece). Now stripped quote-aware before tag-stripping, like the iframe fix.
- **Sources (~31):** added **garymarcus** (Marcus on AI; CI via rss2json) + **profgmarkets** (Prof G Markets, custom
  domain). Removed **benedictevans** (too infrequent) and **Axios** (promo emails).

## ⭐ TRENDING NEWS — CURRENT STATE (supersedes the In-the-news section below)
Live tabs: **UK · World · Business · Politics · Tech · Futurism · HN · Guardian · Money · Reuters · BBC · Time Out ·
Reddit · Wiki · GitHub · Google**.
- **Ordering: strict newest-first by publish time** — the per-source cap was removed (it clustered by platform). It's
  the 10 most-recent unique stories (dedup kept).
- **Reddit (baked, not live):** Reddit 403s Vercel's runtime IP, so `engine/fetch_reddit.py` fetches the **Jotter
  curated multireddit** (`reddit.com/user/fluffy-earth-8062/m/jotter_intelligence/new`, via the relay) into the
  committed `web/lib/reddit-trending.json`; `/api/trending?category=reddit` serves that file. Refreshed by
  `publish.sh` (or whenever fetch_reddit runs + commits). So Reddit is only as fresh as the last publish.
- **Business = UK business-section feeds only:** BBC, Guardian (`/uk/business/rss`), City AM (`/category/business/feed/`),
  Sky News business. (CNBC/NPR removed; **Telegraph has NO working public RSS** — firewalled/dead, even via relay.)
- **World:** DW + Euronews removed. **UK:** The Conversation removed (arts/academic, not news).
- **Money** (id stays `ft`): Forbes+FT+WSJ+Economist+MarketWatch. **HN** = `hnrss.org/newest`. **Futurism** =
  `futurism.com/feed`. **Wiki** pill. Tech: Verge dropped (paywall), VentureBeat/Digital Trends/404 Media added.
  World Cup home module `defaultOpen={false}`.

## ⭐ HOME + UI CHANGES THIS SESSION
- **Home "Latest Insights" = ONE latest post per expert/publication, last 7 days** (`getLatestPerExpert(7)` in
  `lib/data.ts`). Do NOT make this multiple-per-source.
- **READ state removed** from `SignalCard.tsx` (the dim overlay + "✓ read" label + `jotter.read.v1` logic) — it
  overlapped confusingly with the kind tags.
- **Skins: 5 new workstation skins** in `globals.css` + `lib/appearance.ts` SKINS: `next` (Cube/NeXTSTEP), `beos`
  (Yellow Tab — header vars scoped so its yellow bar persists in dark mode), `risc` (Archimedes), `irix` (Indigo —
  light-mode header bar lightened so nav text reads), `win31` (Tiles '92). "Motif" (cde) was added then removed.
  **Star-to-pin-favourites:** `jotter.skinfavs.v1` (`getSkinFavs`/`setSkinFavs`); a ☆/★ on each skin tile in
  `/settings` floats starred skins to the top of the list.

## Layout
```
engine/                      Python pipeline (stdlib only; PDF parsing is web-side)
  experts.json               source config (THE place to add curated experts/publications)
  fetch_meta.py/fetch_full.py    Naughton full WP archive scrape -> data/posts_full.jsonl
  fetch_naughton_recent.py   INCREMENTAL Naughton fetch (appends new posts; used by auto-refresh)
  fetch_expert.py            pull recent RSS/Atom for any expert WITH A FEED (rss + doctorow) -> data/raw_<id>.jsonl
  backfill.py                deep archive per source -> data/archive_<id>.jsonl
  refresh_all.py             fetch-all + backfill-all + build
  build_dataset.py           atomise + merge + classify -> web/data/{signals.jsonl,experts.json}
  data/                      raw + archive jsonl (git-ignored)
web/                         Next.js 16 (App Router, Turbopack, Tailwind v4)
  app/                       routes: search(=Feed) · sources(=Experts) · publications · saved · settings
                             + api/ (search, trending, markets, weather, city-weather, upload-pdf, sources, refresh)
                             NO generate/opendata/trends/attention/daily/chat/synthesis (all deleted; app is LLM-free)
  components/                AppHeader (top bar + expandable weather/date/clock panels), WeatherClock, AutoRefresh,
                             SignalCard, SignalList, TrendingWidget, MarketsSnapshot, CollapsibleSection, LatestInsights,
                             SourcesGrid, SourceProfile, ExpertAdmin, PdfUpload, NavLinks, RadioSidebar, CtaFooter,
                             Logo, ThemeToggle, ThemeHeatmap[parked/unused], ui
                             (deleted: AskPanel, Generator, WeeklySynthesis, DailyIntelligence, OpenDataCard,
                              OpenDataExplorer, TrendExplorer, ThemeTrendsChart, WeatherIcon)
  lib/data.ts                server-only: MERGE engine data + uploads store; search; weeklyBriefing;
                             getLatestPerExpert; themeTrends; suggestedPrompts/Searches; mtime cache
  lib/uploads.ts             server-only: PDF/RSS ingest, profile create/edit/delete, refreshFeeds
  lib/stations.ts            radio master station list (deduped from CSV; SomaFM direct streams resolved)
  lib/{types,saved,themes,format}.ts   (themes.ts mirrors engine theme vocab for TS-side tagging)
  (.env.local                no longer needed — app is LLM-free, no API keys)
  data/                      signals.jsonl (git-ignored) + experts.json (committed)   ← engine output
                             uploads.jsonl + uploads-experts.json (committed)         ← user uploads
```

## Data flow
`fetch_* / backfill.py` write raw+archive jsonl → `build_dataset.py` atomises, strips per-source cruft,
converts `<a>`→markdown links, assigns a universal **kind**, computes aggregates → writes
`web/data/signals.jsonl` + `experts.json`. The app **merges** those engine files with a **separate
uploads store** (`uploads.jsonl` + `uploads-experts.json`) at read time, cached in `globalThis` **keyed by
combined file mtimes** — so a rebuild OR an in-app upload appears automatically, no restart. The engine
rebuild only rewrites engine files, so it **never clobbers uploads** (was a real bug once).

### Signal `kind` (universal) vs `type` (source-specific)
Every signal gets a `kind`: **longread / article / quote / links / data / qanda** (`kind_of()` heuristic). `type`
is the legacy source label (Naughton's note/commonplace/linkblog/book/chart). The Feed filters by
**kind**; expert pages filter by **type** for Naughton, **kind** for others (`SignalList filterBy` prop).
- **`qanda`** (the **Q&A** tab in the Feed) = interview / podcast-transcript / Q&A content. Detected in
  `build_dataset.py` by `is_qanda()`: lines beginning with a `Speaker:` label (`_QA_LABEL` regex), where the
  **two most common speakers each take ≥4 turns AND together account for ≥60% of all labelled lines** (≥8 labels
  total) **AND neither dominant label is a generic template section-header** (`_QA_STOPLABELS`: book/why/note/source/
  summary/…). The stoplabel guard stops recurring templates like WITI's `**Book:** … **Why:** …` book roundups from
  false-matching as a two-speaker interview (they're routed to `links` instead — see `_looks_like_list`). Checked in
  `kind_of()` after the type-maps but before the length heuristics. ~61 signals (Kyle Chayka interview series, Seth
  Godin/Derek Thompson conversations, SEEDS dialogues, Naughton transcript quotes). KIND_LABEL["qanda"]="Q&A".
**Naughton's "Quote of the Day" is dropped** (archive + forward): `classify()` routes any "quote of the day"
heading to `skip`, and the no-`<h2>`-sections branch in `build_naughton` also runs `classify()` so whole-post
QotDs are dropped too. All his other sections are kept.

### Authors vs Publications
Each expert record has `category: "author" | "publication"`. `/sources` shows authors, `/publications`
shows publications. Set it in `engine/experts.json` (curated) or via the in-app add UI (`PdfUpload` passes category).

## Adding a curated expert (engine/experts.json)
`{id, name, blurb, url, adapter, feed?, backfill?, cap?, category?, ...}`
- `adapter:"rss"` → ongoing via `feed`. `adapter:"naughton"` / `"doctorow"` are special section-parsers.
- `backfill`: `"wordpress"` | `"wpcom"` | `"substack"` (archive API; scrapes paywalled posts' free preview
  from the public page; respects `cap`) | `"protein"` | `"lsn"` | `"reddit"` (pages the Arctic-Shift
  Pushshift mirror for a user's full self-post history; body stored as lightly-cleaned markdown) | none.
- Most new adds are Substacks: `adapter:"rss"`, `feed:"<url>/feed"`, `backfill:"substack"`, `category`.
- Then: `python3 fetch_expert.py <id>` + `python3 backfill.py <id>` + `python3 build_dataset.py`.

**In-app, no code (uploads store):** managed profiles `doc-<slug>` (`uploaded:true`) created by the upload API.
On their page (ExpertAdmin): edit name/blurb (**Save profile**), attach/delete PDFs, delete profile.
**Guardrail:** only `doc-*` uploads are editable/deletable (`isManaged()`). **The ExpertAdmin panel only renders
for `uploaded` profiles** — curated experts/publications show no "Add to this profile" bar (it was clutter on
every SEED). The "Add a source" PdfUpload modules were already removed from `/sources` and `/publications`.

**Profile pages are shared:** `components/SourceProfile.tsx` (server) renders the body for both
`/sources/[id]` (backHref `/sources`, "all experts") and `/publications/[id]` (backHref `/publications`,
"all publications"). `SourcesGrid` takes a `basePath` prop so publication cards link to `/publications/[id]`
(was always `/sources/[id]`, which wrongly highlighted Experts in the nav and showed "all experts" on back).

## Sources (~29; see experts.json for the live list)
Authors: naughton (full WP archive 2002→), doctorow (Pluralistic, H1-section parser), digitalnative,
jasminesun, noahpinion, peoplevsalgorithms, resobscura, rushkoff, zine, trendreport, booktwo,
enlightenmentecon, **derekthompson**, **rishad**, **8ball**, **notboring** (Packy McCormick),
**whyisthisinteresting**, **astralcodexten** (Scott Alexander).
Publications: futurism (cap 1500), semafor, theoverspill, neural, netwars, goodinternet, protein,
exponentialview (Azeem Azhar, cap 1000; #NNN issues ARE included),
lsn, a16z, **lastweekincollapse** (Reddit user `LastWeekInCollapse`: `submitted.rss` for recent + `backfill:"reddit"`
via Arctic-Shift for the full ~243-post weekly archive 2021→now; r/collapse roundups).
**`r/Futurology` was REMOVED** from publications (it was link-only noise flooding the Feed) and now lives only as a
**Trending News pill** (`/api/trending?category=futurology`, `r/Futurology/new/.rss`) — see the In-the-news widget section.
Reddit feeds (`reddit.com` in feed/url) auto-get `strip_reddit` + reddit-link removal in build_dataset.
**Self-post Reddit sources** drop `[removed]`/`[deleted]`/<120-char bodies and collapse same-title crossposts
(the author reposts each weekly until automod lets it stand → ~20 empty dupes otherwise). The `"link_aggregator": true`
flag in experts.json keeps a source's headline-only link-posts (skips that filter) — no source currently uses it
since futurology left, but it remains available.

## Surfaces (web/app)
- **No page heroes anywhere**: all pages dropped their eyebrow label + h1 + standfirst (incl. /saved).
  SignalCards show no theme pills (only inline link chips + "original post"), and **no +Report button anywhere**.
  Each signal now carries `category` ("author"|"publication", stamped in build_dataset). SignalCard shows the
  **author's name only** (strips a trailing `(Blog)` from `s.source`); **publications keep their full name**.
  Author display names are `Person (Blog)` where a blog name exists — added for naughton (Memex 1.1), doctorow
  (Pluralistic), notboring (Not Boring), astralcodexten (Astral Codex Ten), digitalnative (Rex Woodbury, flipped),
  goodinternet (René Walter, flipped); a few (jasminesun, rushkoff, derekthompson, rishad) stay plain (no distinct
  blog name).
- **Modules are CollapsibleSections** (chevron, H2 toggle outside the box) on Home, Experts, Publications and
  `/settings`; the H2 doubles as the module's only title. Exceptions: `/search` is one uncollapsed module,
  and `/saved` uses a sticky tab switcher (below).
- **Nav** (NavLinks, client, usePathname): the active route's pill stays filled (grey `--panel-2` bg, `--text`)
  via `aria-current`. `/` matches exactly; others match prefix. Nav labels: **Home · Feed (→/search) · Experts ·
  Publications · Saved** (the old "Search" was renamed "Feed", URL still `/search`; the "Data" item was removed).
- `/` Home: **Trending News** (TrendingWidget) · **Markets** (MarketsSnapshot) · **Latest Expert Insights** (1 signal per source, last 4 weeks). CtaFooter.
- `/search` (**nav label: "Feed"**) SignalList: whole-word full-text search, infinite scroll, kind tabs (**Everything / Long Reads / Articles / Q&A / Links / Data** — Quotes tab removed, Q&A added), theme/year/expert filters.
  The "try" suggestion chips **auto-rotate every 8s** (reshuffle on mount + interval; client-only), and the
  **search-box placeholder examples are generated from those rotating suggestions** so they differ each visit
  (same pattern in TrendExplorer's "track a term" box). No em dashes in placeholders. No
  title/strapline/result-count, not collapsed (it IS the page). (No CtaFooter.)
  **All four filter controls** ("All themes" `<select>`, "Select experts" button, "Select years" button, "Newest first"
  `<select>`) use the `btn-ghost text-xs` class so skin-specific `.btn-ghost` overrides apply uniformly — all four
  match in every skin. An active theme selection highlights the themes select in accent colour (same pattern as experts/years).
- **THE DATA SECTION IS GONE.** The `/generate` route, the "Data" nav item, and everything on it were **deleted** this
  session. Removed components/routes: `OpenDataCard`, `OpenDataExplorer`, `TrendExplorer`, `ThemeTrendsChart`,
  `DailyIntelligence` (the last Groq caller), and the API routes `/api/opendata`, `/api/trends`, `/api/attention`,
  `/api/daily`. **Why:** the topic-tracker (expert-mention counting) was judged "useless"; a rebuilt OpenData explorer
  (live tryopendata.ai REST API — public, no key — search 524+ gov datasets, table+chart+export) was prototyped then
  also scrapped because the user won't spend time digging through datasets. `lib/data.ts` may still contain now-dead
  `topicTrends()`/`themeHeatmap()`/`themeTrends()` helpers (safe to delete). **The current nav is just
  Home · Feed · Experts · Publications · Saved.** If a data/insight surface is wanted again, start fresh.
- `/sources` **Experts** (authors): a single **Authors** collapsible (grid). `/publications` same (**Publications**).
  The "Add a source"/"Add a publication" PdfUpload modules were removed (PdfUpload.tsx + /api/upload-pdf,
  /api/sources now parked). SourcesGrid sort = **A→Z / Z→A only** (signal-count badges removed from cards;
  "Most"/"Least" sort options also removed). `/sources/[id]` = feed (+ upload-manage panel,
  still wired for any pre-existing `doc-*` uploads).
- `/saved`: a **sticky tab switcher** (`Articles (n)` | `Highlights (n)`, centred, sticky at `top:3.5rem`,
  backdrop-blur, **no bottom rule**) with a **free-text search box on the same line, right-aligned** (filters
  the active tab over heading/text/source/tags/note) plus a tag filter below. Highlights cards have **Share** + a
  filled **★** (removes); **no +Report**. CtaFooter.
- **Annotation boxes (both tabs):** every saved Article (SavedArticleCard) AND every Highlight has a free-text
  `<textarea>` with the placeholder **"Jot down your thoughts…"** (the brand pun; was "Add an annotation…").
  Article notes persist to the SavedItem via `updateSavedNote(id, note)` (new `note?` field on `SavedItem` in
  `lib/saved.ts`, keyed by signal id in `jotter.saved.v1`); highlight notes via `updateHighlightNote`. Both save on blur.
- **CtaFooter** copy has no trailing full stop.
- **Author display names** are `Person (Blog)`. Renamed in engine/experts.json + rebuilt: 8ball→`Sean Monahan
  (8Ball)`, peoplevsalgorithms→`Troy Young (People vs Algorithms)`, zine→`Matt Klein (Zine)`,
  whyisthisinteresting→`Noah Brier & Colin Nagy (Why Is This Interesting?)`.
- **CtaFooter** (finite pages): centred "Jotter helps brands turn cultural intelligence into commercial impact." +
  "Find out more" button → jotter.media + LinkedIn icon → linkedin.com/company/jottermedia.

## Appearance / Settings (`/settings`, `lib/appearance.ts`)
- **Two independent axes on `<html>`:** `data-theme` (light/dark, **works for every skin now**) and `data-skin`,
  plus `data-fontsize` (`sm`/`md`/`lg`/`xl`). Persisted in localStorage (`jotter.skin.v1`, `jotter.fontsize.v1`,
  `jotter.theme.v2`) and applied **before first paint** by the inline `APPEARANCE_INIT` script in `layout.tsx`
  (no flash). `lib/appearance.ts` is the client helper (get/set/apply + `SKINS`/`FONT_SIZES` metadata + a
  `jotter-appearance` window event for live sync).
- **Twenty-three skins (grid wraps 3-wide in `/settings`, drag-to-reorder, order saved as `jotter.skinorder.v1`):**
  `default`, `neo`, `tech`, `punk`, `editorial`, `bubblegum`, `pixel`, `deco`, `cyber`, `swiss` (**"Bauhaus"** —
  Archivo, bold panel top-rules, single GOLD accent; renamed from "Swiss / Bauhaus"), `win95` ("Back to 95" — silver
  3D bevels), the retro set: `amber` ("Amber CRT"), `teletext` ("Retro Telly"), `fairlight` ("Fairplay"),
  `terminal` ("Intelligence Terminal"), `mac` ("Return of the Mac" — B&W), `vector` ("Vector Wireframe"),
  `lcars` ("Flight Deck"), AND the four newest:
  - **`darkside` ("Dark Side")** — Death Star / Imperial battle-station HUD: black command console, Sith-red
    readouts (`--accent` red), cold blue data (`--accent-2`), angular mono caps. Dark-first (`dark:true`).
  - **`system1` ("Monochrome '84")** — early 1-bit personal computer: stark B&W, square white windows on a grey
    desktop, hard 1px drop shadows, inverted selection. (Brand-neutral name — do NOT reference the OS/maker.)
  - **`system7` ("Desktop '91")** — "when desktops got colour": B&W window chrome on a teal desktop, **teal**
    `--accent` (was blue — changed to teal per request) + red `--accent-2`.
  - **`bitmap` ("Bitmap")** — 1-bit dithered art: halftone-dot desktop, Silkscreen pixel heads, high-contrast mono.
  **Display NAMES are de-trademarked** (no "Windows", "Macintosh", "System 1/7", "Death Star", "LCARS", etc.);
  the `id`s are unchanged so saved prefs survive. ids `system1`/`system7` keep those literal ids (internal only).
- **Every skin: light palette + night mode** (dark = absence of `data-theme`). All night-mode body/article text
  is white EXCEPT `tech` (terminal green) and `amber`/`fairlight` (phosphor amber/green via `--body-text`).
- **Mono terminal skins** (`amber`, `teletext`, `fairlight`) use **Roboto Mono** (`--font-vt`, big x-height).
  **DO NOT use `zoom` or root `font-size`** here — both were tried and rejected: `zoom` scaled the whole viewport
  (pushed the radio settings button off-screen, clunky settings page) and root `font-size` only scales rem not the
  px-literal text. Instead these skins **enlarge just the reading copy** via targeted rules in globals.css:
  `main .text-\[13px\]` (trending rows) + `main .whitespace-pre-wrap` (article body) → 15px,
  `main .font-medium.leading-snug` (card headings) → 17px. Layout/sidebar/settings stay identical to other skins.
- **`--on-accent` (text/icon colour ON an accent fill) + universal selected-state fill.** A `--on-accent` var is
  defined in `:root`/light (`#1a1205`, the dark-on-gold default) and **overridden per skin** wherever the accent is
  dark/saturated so text stays readable: white for `system1`/`bitmap`/`darkside`/`editorial`/`bubblegum`/`pixel`/`neo`,
  `var(--ink)` for `punk`, `var(--bg)` for `tech`, mode-flipping black/white for `system1`/`bitmap` dark, etc.
  A **global rule** `.chip[style*="--accent)"], .btn-ghost[style*="--accent)"] { background:var(--accent)!important;
  color:var(--on-accent)!important; border-color:var(--accent)!important }` makes EVERY selected filter pill /
  ghost-button FILL with the accent — so selection is visible even on monochrome skins (where accent==text made it
  invisible before). It matches the inline `color/border-color: var(--accent)` that components set on the active item.
  `background` MUST be `!important` (skin `.chip` rules set their own background and are more specific). The markets
  ticker chips are `.panel` not `.chip`, so they're unaffected; `mac`/`cyber` have their own more-specific selected
  rules that still win. Components that hardcoded the old on-gold `#1a1205` on an accent bg (AppHeader weather tabs,
  calendar "today" cell) now use `var(--on-accent)`.
- **Weather/date/clock pill shape follows the skin.** The pill carries a `.weather-pill` class (not a hardcoded
  `rounded-full`); `globals.css` sets its `border-radius` as a **balanced mix**: full pill **999px** for
  default/lcars/bubblegum, **8px rounded** for neo/system7/mac/editorial/deco/swiss/win95/darkside, **0 square** ONLY
  for the genuinely pixel/terminal/CRT/wireframe skins (tech/cyber/punk/pixel/terminal/amber/teletext/fairlight/
  vector/system1/bitmap). (An earlier version was nearly all-square; rebalanced toward rounded.) Border colour stays
  inline (accent when a panel is open).
- **Preferred view on select:** SKINS entries carry an optional `dark: true` (the dark-first skins: `amber`,
  `cyber`, `lcars`, `teletext`, `terminal`, `vector`, `fairlight`, `darkside`). The `/settings` `chooseSkin` flips the theme
  to the skin's preferred mode on select (dark-first → dark, else → light); the user can still toggle after.
  Skin **and** theme both persist (`jotter.skin.v1` + `jotter.theme.v2`), applied pre-paint by the init script —
  so a refresh keeps exactly the skin+mode you left on.
- Fonts via next/font: `--font-vt` (Roboto Mono), `--font-lcars` (Rajdhani — Flight Deck), `--font-plex`
  (IBM Plex Mono, terminal), `--font-vector` (Chakra Petch), `--font-swiss` (Archivo); `win95`/`mac` system stacks.
- **Nav active item** uses the skin accent (`color-mix(--accent 16%, transparent)` pill + accent text) so it
  matches every theme. **ThemeToggle** = filled crescent moon (light) / line sun (dark) SVGs. Settings Mode
  chips are plain "Light"/"Dark".

## Markets snapshot (home page)
- **`/api/markets`** → live quotes for **10 global indices** (S&P 500, Nasdaq, Dow, FTSE 100, DAX, CAC 40, Euro
  Stoxx 50, Nikkei 225, Hang Seng, ASX 200) via **Yahoo Finance** chart API (keyless, `query1.finance.yahoo.com`,
  UA header). **% change uses `range=1d`** so `chartPreviousClose` is the *previous session* close (the true daily
  swing). `range=2d` was a bug — it made `chartPreviousClose` a 2-day reference and gave wrong %. Cached 60s.
  NB this runs in a **simulated-2026 environment**, so Yahoo returns 2026-dated values (e.g. S&P ~7,584) — correct.
- **`MarketsSnapshot`** (client) renders a horizontal ticker of `.panel` chips (name / price / ▲▼ %, coloured by
  `--up`/`--down`), auto-refreshes every 60s. Mounted **after** the Trending News module (order: Trending → Markets
  → Latest Expert Insights). The ticker scroller uses `py-1` (not `pb-1`) so the Jotter-skin hover-lift on the chips
  isn't clipped at the top by `overflow-x-auto`.
- **Tap a chip → expanded interactive chart** (`ExpandedChart` + `PriceChart`). `/api/markets?symbol=&range=` returns
  full **OHLCV** points (`{t,o,h,l,c,v}`) via the Yahoo chart API, with finer intervals per range for density
  (1D=2m, 5D=15m, **1M=60m** so it's ~155 points not a chunky 22-point daily, 6M/1Y=1d, 5Y=1wk). PriceChart draws a
  **smooth Catmull-Rom spline** (1.4px), a **Yahoo-style crosshair** (vertical + horizontal dashed lines, dot,
  right-edge price tag) and a **rich OHLC+Volume tooltip box** that flips side near the right edge. Range buttons
  1D/5D/1M/6M/1Y/5Y. Chart payload is cached in globalThis keyed by `symbol:range` (the shape changed when OHLCV was
  added, so a server restart is needed to clear stale `{t,c}` cache entries after such changes).

## Settings entry point + radio sidebar
- **Settings (`⚙`) lives in the radio sidebar's bottom-left, NOT the nav.** Collapsed strip: top area (chevron +
  play) opens the radio; a **divider line** then a **gear box** below it links to `/settings`. Expanded panel: a
  **"⚙ Settings" footer button** at the bottom (border-top divider). The gear icon was added to the sidebar's
  `Icon` component (`name="gear"`).
- **Radio collapsed play button** = bare accent triangle (no circle — too logo-like). The radio transport bar bg
  uses `var(--header-bg)` so it lines up with the top nav in every skin.
- **Settings page never zooms** (`body:has([data-settings])` is unused now — terminal skins dropped `zoom`; the
  `data-settings` marker on the settings root div is harmless/kept).
- **Dark mode = the *absence* of `data-theme`** (light sets `data-theme="light"`; dark removes it). So each skin
  is written as: base rule `html[data-skin="X"]` = **light** palette, and `html[data-skin="X"]:not([data-theme="light"])`
  = **dark** palette. Component chrome reads the colour vars via **`--ink`** (structural border/shadow colour,
  flips black↔white between modes) + `--accent`, so borders/shadows/fonts are shared across both modes — only the
  palette swaps. When adding a skin, define **every** var in both the light and dark blocks.
- **Fonts** via **next/font/google** in `layout.tsx` (self-hosted, exposed as CSS vars, only downloaded when a skin
  actually uses them): `--font-neo` (Space Grotesk), `--font-serif` (Fraunces → editorial), `--font-tech`
  (JetBrains Mono → tech + pixel/cyber bodies), `--font-punk` (Anton), `--font-bubble` (Fredoka), `--font-pixel`
  (Silkscreen), `--font-deco` (Poiret One), `--font-cyber` (Orbitron).
- **Every skin includes button animations** (transition + `:hover` pop + `:active` press/colour-flip), tuned per
  skin: neo/punk/pixel = hard-shadow press (pixel uses `steps()` for choppy 8-bit motion), bubblegum = bouncy
  `cubic-bezier` squish, tech/editorial/deco/cyber = colour-flip + small translate. Cyber panels/buttons use
  `clip-path` notched corners; deco panels use a double gold rule via inset `box-shadow` + `color-mix`.
- **Jotter (default) skin panel hover** — `html:not([data-skin])` (the default skin removes `data-skin` entirely;
  `[data-skin="default"]` never matches). `.panel` gets a 180ms transition; `.panel-hover:hover` → gold border
  (`var(--accent)`), soft glow (`box-shadow: 0 6px 20px -4px color-mix(...accent 20%...)`), 2px upward lift.
- **SignalCard read state** — see the fuller note in Conventions/gotchas (overlay + "✓ read" label is **bottom-left**;
  suppressed in Saved via the `noReadState` prop).
- **Display size** = `zoom` on `<html>` (`sm` 0.9 / `lg` 1.12 / `xl` 1.25) so it scales the whole UI including the
  app's many px-literal font sizes.
- **`/settings` is four `CollapsibleSection` modules:** **Text size** · **Skins** (Mode toggle + drag-to-reorder
  grid inside) · **User guide** (per-section how-to prose) — these three `defaultOpen={false}` (collapsed) — and
  **About** which is **`defaultOpen={true}` (expanded), with all its sub-sections shown** (not nested-collapsible).
  About copy is based on the Jotter FAQs (jotter.media/faqs): leads with "an insights dashboard built for our
  clients and researchers", then Who/How/Work-with-us blocks, then a **Legal disclaimer** (info-only, aggregates
  third-party/public data, not financial/legal advice, market data delayed, © year Jotter). Using CollapsibleSection
  means the module headers are the **same `text-lg font-medium` H2 as "Trending News"** (old `.label` headers gone).
- **ThemeToggle** (nav) now shows for **all** skins (every skin has a night mode); it listens for the
  `jotter-appearance` event to stay in sync. **Toggle animation:** the icon is wrapped in a `<span key={String(light)}>`;
  React remounts it on change, triggering the CSS `theme-icon-in` keyframe (600ms spin-in with spring easing). The
  **settings gear** (`Icon name="gear"` in RadioSidebar, class `gear-icon`) plays a 650ms 360° spin via
  `a[href="/settings"]:hover .gear-icon { animation: gear-spin ... }` in globals.css.
- **Night-mode text is white by default.** Headings/UI text via `--text:#ffffff` (every dark palette incl. the
  default `:root`). **Article/signal body copy** (`SignalCard.tsx`) uses a dedicated `--body-text` var:
  `html[data-theme="light"]{--body-text:var(--muted)}` (softened grey in light) and
  `html:not([data-theme="light"]){--body-text:#ffffff}` (white at night). **Exceptions** (phosphor identity):
  Tech-Minimal sets `--body-text:#3ddc7e` (terminal green); Amber CRT + Fairplay set amber/green `--body-text` in
  their dark palettes (skin+dark selector out-specifies the global white rule). Accents/borders stay coloured.
- **Nav lives in `AppHeader`** (Logo · WeatherClock pill · NavLinks · ThemeToggle). The settings `⚙` is in the
  **radio sidebar**, not the nav (see "Settings entry point"). The WeatherClock pill is the centred
  weather/date/clock widget (see "Header: expandable weather / date / clock pill").
  **IMPORTANT — Turbopack stale-CSS gotcha:** editing `globals.css` skin
  blocks repeatedly served *stale compiled CSS* (rules correct in source AND in the browser's loaded stylesheet,
  but old values still rendered). A hard browser reload is NOT enough, and even a plain dev-server restart can
  miss it. The reliable fix is **`rm -rf web/.next` then restart `npm run dev`** (clears Turbopack's build cache).
  Always do this after editing skin CSS or adding next/font imports, then verify in the browser.

## Header: expandable weather / date / clock pill (AppHeader + WeatherClock)
The whole top bar is now **`components/AppHeader.tsx`** (a client component rendered in `layout.tsx` in place of
the old inline `<header>`). It holds the logo, the **WeatherClock pill** (centre), NavLinks + ThemeToggle (right),
AND an **expandable panel that drops down below the nav row and PUSHES content down** (it is inside the sticky
header, animated via `max-height` 0↔600px, 380ms ease — not an overlay).
- **WeatherClock** (`components/WeatherClock.tsx`) is now a controlled child: it renders the pill
  `☁ N° · D Month · HH:MM` (regular nav weight, emoji + temp + date + time) and lifts state up via props
  (`activeSection`, `onToggle`, `onWeatherData`). Each of the three segments is a button; clicking one toggles
  that section open in AppHeader (click again, or click another segment, to switch/close). Border turns accent when open.
- **Three panels (all in AppHeader, fixed height `PANEL_H+40`):**
  1. **Weather** (click the temp) → hourly forecast. Footer has a tab switcher **Hourly · Daily · Rain · Wind**
     (Hourly = next 12h full-width emoji+temp+precip%; Daily = 7-day; Rain = precip-probability bar chart; Wind =
     wind-speed bars), plus place name + "Full forecast ↗" → `bbc.co.uk/weather/2643743`. **Emoji, not custom SVG
     icons** (a stroke-icon set `WeatherIcon.tsx` was built then reverted — user preferred emoji; file is parked/unused).
  2. **Date** (click the date) → **two-month calendar** (current + next), Mon-first, today dot in accent. Horizontally
     **scrollable 3 months back → 8 forward** via ‹ › arrows (the months strip; no scroll-snap).
  3. **Time** (click the clock) → **world clock**: 18 cities west→east in one horizontally-scrollable flex row
     (`ALL_ZONES`), **London centred on open** (scroll set via `clientWidth/VISIBLE_COLS` after a 30ms paint delay)
     and highlighted in accent. ‹ › arrows scroll 3 cities at a time. **Each city shows current local time + date
     (if it differs from London) + current temp & weather emoji** from **`/api/city-weather`** (one batched keyless
     Open-Meteo multi-location call for all 18 city coords, cached 30 min in globalThis; coords live in the route and
     MUST match `ALL_ZONES` order). No "Now" label, no offset scrubber (both removed). Karachi (UTC+5) is used, not
     Mumbai (the +5:30 half-hour was confusing).
- **Per-location weather** (the pill itself) still comes from **`/api/weather`** → Open-Meteo current + `hourly`
  (24h: temp/code/precip-prob/precip-mm/wind) + `daily` (7-day). BigDataCloud reverse-geocode for the place name.
  Browser-geo coords cached in `localStorage jotter.geo.v1` (re-prompted ≤ daily); denied/unavailable → **London
  fallback** (`51.5074,-0.1278`). Cached 20 min per rounded coord. **Schema-migration guard:** the cache is
  invalidated if `cached.data.emoji` is missing (added when the payload shape changed — old cache entries lacked it).
  NB `searchParams.has()` is checked before parsing lat/lon (else `Number(null)===0` would query 0,0, the ocean).
- **SMOOTH-SCROLL GOTCHA (calendar + world clock):** native `el.scrollBy({behavior:"smooth"})` AND rAF-driven
  `scrollLeft` are **both silently dropped** in this Turbopack/Chrome combo (the value never sticks). Only a **direct
  synchronous `el.scrollLeft = …` assignment** works. `smoothScrollBy()` in AppHeader is therefore an instant (not
  animated) sync assignment. Don't "fix" it back to smooth — it'll break.

## Radio sidebar (RadioSidebar, in layout.tsx body)
Internet-radio player, left of the main content. `lib/stations.ts` = **249 stations** (deduped from the JOTTER
RADIO CSV; SomaFM URLs resolved to direct mounts). **32 dead streams pruned** (mostly live365 `das-edge*`
hosts that return 401 — token-gated, unplayable in a plain `<audio>` — plus a few 404/unreachable). To re-prune
later: extract the `url`s, probe with curl (`-L -r 0-1`), drop any final 4xx/5xx/000 or `text/html`. Behaviour:
- **Collapsed by default on every load** (does not persist open). Click anywhere on the collapsed strip to expand.
- **Remembers your last station + genre** across reloads: `play()` writes the station name to
  `localStorage jotter.radio.last-station.v1`; `shuffleSource()` writes the genre/source id to
  `jotter.radio.last-src.v1`. On mount both are restored (sets `current` + `activeSrc`) but it does **NOT auto-play**
  (browsers block autoplay without a user gesture) — it just pre-selects so the next play resumes where you were.
- Classic transport (SVG icons, no emoji): prev / play-pause / next / shuffle. **OS media keys** work (Media Session API).
- **Genres** section (fixed, collapsible): All + genres A–Z (Title Case) + Favourites (filed under F). Clicking shuffles that source.
- **Stations** section (collapsible, closed by default): always-visible search (matches name start), Index/Favourites toggle, list.
  Playing station floats to top of the list; only this list scrolls. **List rows are rendered by a plain `renderRow(s)`
  helper, NOT a `<Row/>` component.** A `Row` component defined *inside* RadioSidebar got a new identity every render,
  which remounted the whole `<ul>` on any state change (e.g. a favourite toggle) and **reset the scroll to the top** —
  the rows now reconcile in place by `key`, so favouriting keeps your scroll position. (Don't reintroduce an inner component.)
- **Queue model**: choosing a genre / Favourites / a list row sets the playback context; next/prev/shuffle stay within it.
- Favourites in localStorage (`jotter.radio.favs`). Sidebar is its own scroll territory (wheel never scrolls main feed; no visible scrollbar).
- Each station has a click-through ↗ to its website. Sort ignores leading "The" and spells leading numbers (20FT→T, 70s 80s→S).

## LLM / AI: NONE (removed)
The app has **no LLM features**. All Groq code was deleted: `/api/chat` + AskPanel, `/api/generate` + Generator,
`/api/synthesis` + WeeklySynthesis, and `/api/daily` + DailyIntelligence. There is no `GROQ_API_KEY` dependency.
This was deliberate so the app can be deployed publicly without an AI aspect. If an LLM feature is ever re-added,
it must be opt-in and must not block the deterministic experience.

## Uploads (`/api/upload-pdf`, `/api/sources`; logic in `lib/uploads.ts`)
- PDF→archive: ONE paragraphized signal per doc (publish date pulled from PDF metadata), tagged `upload_id`.
- PDF→ground: one-off Ask context, not persisted.
- RSS feed: one signal per item, stores `feedUrl`, **auto-refreshes** via `/api/refresh → refreshFeeds()`.
- Manage: update `{id,name,blurb}`; DELETE `?id=` (profile) or `?id=&upload=` (one PDF). No OCR.

## In-the-news widget (`/api/trending`)
Category tabs: **UK · World · Business · Politics · Tech · Futurology · Guardian · FT · Reuters · BBC · Time Out · Reddit · Wikipedia · GitHub · Google** (the "Technology" pill is **labelled "Tech"** — id stays `technology` — so the row doesn't wrap to two lines on the wide Bauhaus skin). ~10 latest headlines from broad
free-to-read feeds (Guardian/BBC/Sky/Independent/i[section feeds]/Al Jazeera/DW/Euronews/NPR/CBC/CNBC/City AM/
Politico/TechCrunch/Ars/Verge/Register/Next Web/Rest of World/Vice tech/Vox Future Perfect…), max 2 per source.
**FT** (`ft.com/rss/home`, paywalled) and **Time Out** (`timeout.com/london/feed.rss`, filtered to `/news/` via the
`match` field) are plain RSS `CATEGORIES` entries. Pills are **drag-reorderable** (persisted `jotter.news.order`)
and the **last-viewed pill is remembered** (`jotter.news.category`). Each row's **search button** (a gold magnifier,
not the old tiny ↳) searches the archive for the **whole headline** (entity pills Wikipedia/GitHub use `term`),
so it carries the story's wider context, not just the first proper noun (`searchSignals` strips stopwords + ranks
by overlap). NB keyword overlap still pulls the odd false match (e.g. "ramp-up"→the company "Ramp") — sharper
ranking is part of the deeper search/semantic work.
`GEAR_RE`/`GEAR_URL_RE` aggressively strip gadget/review/deal/affiliate/product-launch content.
**Near-duplicate clustering** (`storyKeys`/`isDuplicateStory`): the same story under different outlet headlines is
collapsed to one — a candidate is skipped if it shares a significant bigram (e.g. "henry nowak") or ≥3 significant
words with one already kept (newest framing wins). Conservative on purpose (won't merge two stories that share
only one word). Applies to the multi-feed RSS categories.
**Wikipedia** is a separate data source (not RSS): `fetchWikipediaTop()` hits the Wikimedia REST pageviews API
(`/metrics/pageviews/top/en.wikipedia.org/all-access/Y/M/D`, the data behind the topviews tool), walking back
from yesterday to the latest day with data, dropping non-article namespaces / Main_Page / placeholders and
stripping disambiguation suffixes → top 10 most-read articles (links to en.wikipedia.org; ↳ searches the archive).
Each gets a one-line **context** (`wikiContext()` → REST summary endpoint: Wikidata `description`, else first
sentence of the `extract`), rendered inline after the title as muted `· context` so rows stay single-line and
the box height matches the other categories (`NewsItem.context`; other categories have none).
**Guardian** is likewise separate: `fetchGuardianMostRead()` hits the Guardian most-popular JSON
(`api.nextgen.guardianapps.co.uk/most-read.json` → an `html` blob), regex-pairs each article anchor with its
`js-headline-text` → top 10 "most read across the Guardian".
**GitHub** (`fetchGithubTrending`): scrapes `github.com/trending?since=monthly&spoken_language_code=en` (no API),
parses each repo's "N stars this month", **orders by that star volume desc**, top 10; title `owner / repo`,
context = `★ N this month · <tagline>`. **Google** (`fetchGoogleTrends`): the GB daily-trends RSS
(`trends.google.com/trending/rss?geo=GB` — the 24h daily feed) → search terms **sorted by `approx_traffic` desc,
top 10**; context = `N+ searches · <top news headline>`, linked to the top related news story. Among each trend's
multiple `<ht:news_item>`s it **prefers a `.uk` then any non-foreign-ccTLD source** so the headline isn't in
another language. **Reuters** (`fetchReuters`): reuters.com 401s scraping, so it uses Google News RSS
(`news.google.com/rss/search?q=site:reuters.com+when:1d`) and strips the trailing " - Reuters" tag. **BBC Most
Read** (`fetchBbcMostRead`): scrapes the `data-component="mostRead"` ranked list on bbc.co.uk/news. **FT** is a
plain RSS feed (`ft.com/rss/home`) so it's a normal `CATEGORIES` entry (paywalled links, added on request).
**Reddit** is also a `CATEGORIES` RSS entry (`reddit.com/r/news/rising/.rss`, links to the reddit thread). **Futurology**
is likewise a `CATEGORIES` RSS entry (`reddit.com/r/Futurology/new/.rss`, **most recent posts**, source label
`r/Futurology`) — **r/Futurology was MOVED here out of `engine/experts.json`** (it was a `publication` flooding the
Feed with link-only posts; removing it dropped its signals from the dataset, and it now lives only as this live
trending pill). The generic path takes up to **12 candidates per feed** (was 8) so single-feed cats (FT/Reddit/Futurology) can hit 10.
All scraped/API sources are dispatched from a single `CUSTOM` fetcher map in GET (wikipedia/guardian/github/
google/reuters/bbc), bypassing the RSS gear filters; everything else is RSS feeds.
Server cache 5 min/category; **client polls every 2 min** so it stays fresh.
**Pills are drag-to-reorder** (HTML5 DnD; drag tracked in a ref so reorder is reliable) and the order persists
(`localStorage jotter.news.order`, unknown ids dropped + new pills appended). The **selected pill also persists**
(`jotter.news.category`) so the widget reopens on your last-viewed source. Both restored in a mount effect (client-only).

## Conventions / gotchas
- **Next.js 16**: read `web/node_modules/next/dist/docs` before non-trivial Next work; `searchParams`/`params` async; no regex `/s` (use `[\s\S]`).
- **Caching is mtime-keyed** (lib/data.ts) — rebuilds/uploads appear without restart. Restart only for code changes. (api/trending caches in globalThis and survives HMR → restart to clear it.)
- **Auto-refresh runs on EVERY load** (`/api/refresh`, in-flight lock, no throttle): `fetch_naughton_recent.py; fetch_expert.py; backfill.py lsn; build_dataset.py` + `refreshFeeds()`. Triggered by `AutoRefresh` in layout. (Naughton/Doctorow are non-rss adapters; fetch_expert fetches anything with a `feed`, and Naughton uses the incremental script. `lsn` is feed-less so its append-and-dedupe backfill runs here too.) **⚠ This MUST be replaced with a cron before public deploy** (per-load engine runs would get the server IP rate-limited) — see the DEPLOY section in OUTSTANDING.
- **fetch_expert.py is per-feed isolated** (try/except around each source; 25s timeout; never overwrites a raw file with an empty/failed parse). This was a real outage: enlightenmentecon's feed started 404-ing, the uncaught error aborted the whole run, and every source listed after it went stale. That feed is now removed (`archived:true`, archive kept). **If many sources go stale at once, suspect one feed throwing and check the fetch_expert output for `! <id> fetch failed`.**
- **TURBOPACK CACHE GOTCHA — clear `.next` after a folder rename / move.** When the project folder was renamed
  (`memex-foresight` → `jotter-intelligence`), the `.next` build cache held stale absolute paths and Turbopack
  **panicked** compiling `/settings/page` ("Next.js package not found") then retried infinitely — the page appeared
  to glitch/flicker violently (it was hot-reloading many times/sec). Fix: `rm -rf web/.next` then restart `npm run dev`.
  This is the same class as the stale-CSS gotcha; any move/rename needs a `.next` wipe.
- **Theme defaults to LIGHT** (the brand). Init script in layout.tsx sets `data-theme="light"` unless `localStorage['jotter.theme.v2']==='dark'`. ThemeToggle writes that key.
- Dates: **UK format** via `lib/format.ts fmtDate`. Inline links stored as markdown `[text](url)`.
- localStorage features (pins, highlights, saved-notes, theme, radio favs + last-station/genre, read-state) in `lib/saved.ts` + radio/SignalCard components.
- SignalCard: star = save/pin; **Share** menu (Email/WhatsApp/Copy) replaced the old "+ Report" button.
- **SignalCard read-state:** expanding a card marks it read — its id is written to `localStorage jotter.read.v1`
  (a JSON array; `getReadIds()`/`markReadId()` in SignalCard.tsx). When a read card is **collapsed** it shows a faint
  overlay (`color-mix(--bg 45%, transparent)`) + a "✓ read" label **bottom-LEFT** (moved off bottom-right so it no
  longer overlaps the "original post" chip); re-expanding removes the overlay. Survives reloads.
  **SignalCard takes `noReadState?: boolean`** — the **Saved page passes it** (`<SignalCard noReadState />`) so saved
  items are NOT dimmed (everything saved is obviously already seen; the dimming there was confusing).
- **`kind_of()` thresholds were heavily recalibrated** (false tags were rampant). Order after the type-maps +
  `is_qanda`: **quote** (tlen<1000 + quote markers) → **data** (`stats>=5 AND tlen<1800 AND ≥3 stats/1000chars` —
  genuinely stats-dense short pieces only; was a loose `>=3 stats` that mis-tagged any article with a few numbers) →
  **links** — qualifies THREE ways: (a) short-form `tlen<500 AND n_links>=1`, (b) **link-dense** `n_links>=3 AND
  tlen/n_links < 380` (headline+URL repeated, e.g. Doctorow "Hey look at this"), or (c) `_looks_like_list()` a
  **templated list** (a label repeats ≥4× AND n_links≥4, e.g. WITI book editions) → **longread** (`tlen>6000`,
  ~1000+ words; was a too-low 2500) → else **article**. Post-rebuild split: ~47% article / 30% links / 15% longread /
  6% quote / **1% data** (was ~12%) / 0.2% qanda. **Any kind_of/is_qanda change needs `python3 build_dataset.py`** to
  take effect (mtime-cached, so the running app picks the rebuild up without a restart).
- **SignalCard body text wraps long URLs:** the `<p>` has `overflowWrap:"anywhere"; wordBreak:"break-word"` so raw
  archive.org-style URLs no longer overflow the card horizontally.
- Cruft strippers in build_dataset: `strip_feed_cruft`, `strip_digitalnative`, `strip_exponentialview`
  (testimonials + `∙ Paid`/like-counts/`Share` chrome; "Live with…" dropped), `strip_reddit`, Protein/Doctorow chrome.
- **`clean`/`clean_block` strip `<script>` AND `<style>` blocks** (the CSS inside `<style>` used to leak as plain
  text — Protein SEEDS table styling `.tg {border-collapse…}` was showing on ~84 signals) and **drop `<iframe>`
  embeds** with a quote-aware regex (Instagram embeds store a whole escaped HTML doc in `srcdoc="…"`; its literal
  `>` chars broke the generic `<[^>]+>` stripper and leaked the embed markup — exponentialview).
- **Substack body extraction** (all `backfill:"substack"` sources): paid posts are scraped as the full
  post page, so `extract_substack_body` isolates the `<div class="body markup">` container (depth-matched),
  dropping the post-header (title/subtitle/byline + "Post UFI" like/comment/share bar) and footer
  (subscribe/comments/recs) wholesale. `strip_image_credits` then drops standalone "Photo by … on Unsplash"
  hero captions. Clean RSS items (no body-markup div) pass through untouched. This replaced the old
  line-by-line chrome matching that leaked `substack.com` / author byline / `· Paid` / counts / `Share`.

## OUTSTANDING / FUTURE

### >>> NEXT UP: DEPLOY to jotter.media (user is starting this in a new chat) <<<
**Verdict: viable, nothing fundamental blocks it.** The app is LLM-free → no API keys / no per-user cost. But it
**cannot** go on Vercel/Netlify as-is — it needs an **always-on host** for three architectural reasons:
1. `web/data/signals.jsonl` is **~110 MB and changes daily** → over GitHub's 100 MB limit, can't be committed.
   It must be **generated on the server** by the Python engine (onto a persistent disk).
2. The **Python engine must run on a schedule** to refresh → host must run **both Node + Python + cron**.
3. The app **writes to the filesystem** (data file + uploads store) and **loads the 110 MB file into memory**
   (`lib/data.ts` cache) → needs a **persistent disk** and **~1 GB RAM**. Serverless is the wrong shape.

**THE ONE REQUIRED CODE CHANGE BEFORE LAUNCH:** today `AutoRefresh` (in `layout.tsx`) hits `/api/refresh` — which
runs the **full Python engine — on EVERY page load**. Fine for one local user; on a public site it would hammer the
sources (Reddit/Substack/Yahoo) from one datacenter IP and get rate-limited/blocked. **Replace it with a scheduled
cron** (hourly/nightly `engine/refresh_all.py`) and remove/disable the per-load trigger.

**Recommended path (~$5–20/mo), Railway easiest:** Dockerfile with `node`+`python3` → mount a **volume** at
`web/data/` → `next build` → `next start` → a **nightly cron** runs `engine/refresh_all.py` on the volume → point
**jotter.media** DNS at the host. First deploy runs a full scrape (10–30 min) to seed the volume; nightly is incremental.
**Honest caveats:** some live data (Reddit, Yahoo, GDELT-class) is flakier from a cloud IP — caching mitigates it,
expect occasional gaps. **What an agent CAN do:** write the Dockerfile, the cron, the per-load-refresh removal, a
step-by-step deploy guide. **What it CAN'T:** create the host account, enter payment, or change DNS (user-only).

### Other
- **Parked/unused** (safe to delete): `components/ThemeHeatmap.tsx`; possibly-dead `topicTrends()`/`themeHeatmap()`/
  `themeTrends()` helpers in `lib/data.ts` (their UI — the Data section — is gone). `PdfUpload.tsx` + `/api/upload-pdf`
  + `/api/sources` are still wired for the in-app doc-upload flow (ExpertAdmin), so keep those.
- **Postgres + pgvector migration (gated on infra).** Schema at `web/db/schema.sql`. NOT built: the loader and the
  DB-backed data layer behind a `DATABASE_URL` flag. NB semantic/RAG would re-introduce an embeddings API — keep it
  deterministic-first per the LLM-free goal. Lower priority than deploy.
- In-app RSS auto-refresh only pulls latest ~30/run (no deep history).

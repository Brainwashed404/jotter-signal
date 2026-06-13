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

## ⭐ SESSION 2026-06-13: WDIM dedup + redesign, World Cup upgrade, dead-code cleanup
All shipped to production (commits `912f922`, `e89ffbc`, `601db96`).

### Dead-code cleanup (commit 912f922)
- Deleted unused components `LatestInsights.tsx`, `PdfUpload.tsx`, `ThemeHeatmap.tsx`. Pruned ~500 lines of dead
  helpers from `lib/data.ts` (819→316): `recentSignals`, `weeklySummary`, `weeklyBriefing`, `getLatestPerExpert`,
  `suggestedPrompts`, `themeTrends`, `topicTrends`, `themeHeatmap`, `latestFeed`, `weeklyThreads` + their types.
  `/api/upload-pdf` + `/api/sources` KEPT (ExpertAdmin calls them directly).
- `refreshFeeds()` re-wired into `/api/refresh` (it had become orphaned; dev-only path, prod returns early on `DATA_URL`).
- `eslint.config.mjs`: ignore `scripts/**` (CJS build script), add `ignoreRestSiblings` + `^_`. Remaining
  `npm run lint` errors are all intentional `react-hooks/set-state-in-effect` (mount hydration / clock tick /
  prefetch); Next 16 `next build` does not run eslint so they don't block deploy.

### ⭐ WDIM ("What Did I Miss?") — DEDUP IS THE BIG CHANGE (commit e89ffbc)
**Problem:** the same stories repeated across audiences (b2b/b2c) and across time filters (day/week/month).
**Fix (all in `lib/wdim.ts` + `app/api/wdim/route.ts`):**
- **Disjoint signal windows per range** via `recentForSynthesis(days, limit, minDays)` (new `minDays` lower bound in
  `lib/data.ts`): day = last ~2d, week = 2–8d ago, month = 8–31d ago. So no signal can appear in two ranges.
- **Per-audience bundle**: `generateWdimBundle(audience, news, markets, excludeTitles)` runs all 3 ranges in PARALLEL
  then `dedupeBriefing` removes any development headline / perspective thesis already seen (day→week→month, across
  BOTH zones). News only feeds the `day` range (week/month developments come from their windowed signals).
- **Cross-audience**: the other audience's titles are passed as `excludeTitles` (soft prompt exclusion) so b2b/b2c diverge.
- **Route** caches per `${aud}-${range}` but generates the whole audience bundle on a miss; an **in-flight lock per
  audience** (`g.__wdimInflight`) means the client's near-simultaneous day/week/month requests share ONE generation
  (was 3×). `maxDuration = 60`. Verified: b2b had 0 cross-range dupes (was many). ⚠ Local `claude` CLI flakes on
  back-to-back parallel batches (contention) — production uses `ANTHROPIC_API_KEY` (handles parallel fine).
- **Expert perspectives capped at 4** (schema maxItems + `normaliseBriefing` slice).
- **Thought Starters reworded**: were narrow imperatives, now forward-looking talking points that extrapolate the
  briefing's WIDER themes into a prep prompt (rhetorical question welcome). The no-advice rule is carved out so ONLY
  directives may be prescriptive. Ticking a Thought Starter SAVES it to a new **Saved → Thought Starters** tab
  (`lib/saved.ts` `useThoughtStarters`/`toggleThoughtStarter`, key `jotter.thoughtstarters.v1`; id derived from text).
- **Readability redesign** (commit 601db96): bigger type throughout (body 13→15px, dev headlines 16px, macro 16px,
  thought starters 15px), relaxed line-heights, more padding/gaps. **Zone sub-heads** (`ZoneLabel`) are now 14px bold
  with an accent tick (were faint 11px muted). Expert-perspective cards get a soft accent wash on hover.

### Home section chrome (commit e89ffbc)
- **Single thick rule fixed under each section title**: header `borderBottom: 3px solid var(--text)` shown ONLY when
  collapsed (open sections already show their content panel's top rule, so no double line). Touches
  `CollapsibleSection`, `WhatDidIMiss`, `TrendingAndInsights`.
- **Collapse state persists** per section in localStorage via `lib/uiState.ts usePersistentToggle(key, default)`
  (keys: section title, `"wdim"`, `"latest"`; `jotter.collapse.<key>`).
- **CtaFooter top border removed** (the line above the Jotter CTA).

### Inline images in the Feed (commit e89ffbc)
- **Root cause of bottom-clustered images:** Substack puts `data-attrs="..."` on every content `<img>`, and
  `build_dataset.py clean_block` line ~128 (the `<anytag data-attrs>` embed stripper) was deleting those images
  BEFORE the img→markdown conversion, so they resurfaced via the `s.images` bottom fallback in `SignalCard`.
  **Fix:** the catch-all now excludes `<img>` (`<(?!img\b)...data-attrs...>`); tweet/link embeds (`<div|figure|p
  data-attrs>`) are still stripped. Rebuild dropped bottom-clustered images 4189→~1400 and raised inline 5075→7862.
  Remaining bottom cases are theoverspill / naughton (WordPress, different image structure) — not yet addressed.
  **Needed a data rebuild + commit of `signals.jsonl.gz`.**

### ⭐ World Cup section redesign (commit 601db96)
`app/api/worldcup/route.ts` + `components/WorldCupChart.tsx`.
- **Stats tiles / facts**: teams, matches played / 104, goals, goals-per-match — derived from the cumulative
  standings (`sum(played)/2`, `sum(gf)`) so they're accurate tournament-wide, not just the scoreboard window.
- **Standings sorted** by points → goal difference → goals for (guaranteed real-time placing; ESPN order not trusted).
- **Bigger readable tables**: ~0.95rem team names, 24px flags, larger cells/padding, group cards `minmax(300px)`.
- **New Fixtures tab**: `fetchMatches` now returns ALL matches (group + knockout) with `label` + `statusDetail`;
  the view groups them by date with flags, scoreline (live/post) or kickoff time (pre — ESPN returns score 0 not
  null for unplayed games, so only show a scoreline once live/finished), and FT/live status.
- **New "Latest World Cup news"** list: `fetchNews()` via Google News RSS (`q=FIFA World Cup 2026`), top 6 with sources.
- Tabs are now **Group Stage · Fixtures · Bracket**; bracket logic unchanged (shows a "fills in after groups" note when empty).

## ⭐ CURRENT DEPLOYMENT & DATA PIPELINE (2026-06; supersedes older "not deployed" notes below)
**The app IS live: `intelligence.jotter.media` on Vercel** (invite-gated via middleware). Repo auto-deploys on
push to `main`.
- **Data is baked at BUILD time, not fetched at runtime.** `next.config.ts` `outputFileTracingIncludes` bundles
  `web/data/signals.jsonl.gz` + `experts.json` into the serverless function; `lib/data.ts` reads the local bundled
  file (zero per-request network). Home page is ISR `export const revalidate = 300`. **New data only appears after a
  Vercel rebuild** (a push, even an empty commit, triggers one).
- **⭐ COMMITTED DATA IS NOW AUTHORITATIVE (2026-06-10).** `web/scripts/fetch-data.js` no longer downloads from B2 by
  default: if a healthy committed `signals.jsonl.gz` exists (>5 MB) it uses that and **skips the B2 download entirely**;
  B2 is only a fallback when the committed file is missing. **Why:** a successful B2 download used to OVERWRITE the
  good committed file with stale/capped data, which is what kept resurrecting removed sources (Benedict Evans) and
  hiding new ones (Ethan Mollick, today's LSN). The CI "Data refresh" workflow commits a fresh build every run, so the
  committed file is never more than a cycle stale, and local builds can be committed directly for an instant update.
  This also removes the ~32 MB-per-deploy B2 download that was the main thing blowing the 1 GB/day cap.
  **⚠ DATA PRIORITY (changed 2026-06-10): `fetch-data.js` now PREFERS the committed `web/data/signals.jsonl.gz` +
  `experts.json` and only downloads from B2 if a healthy committed file is absent.** Previously a successful B2
  download OVERWROTE the committed file, so stale/capped B2 data repeatedly resurfaced on the live site (Benedict
  Evans reappearing after removal; Ethan Mollick missing after being added) even when the committed file was clean.
  The committed file is the source of truth; CI commits a fresh copy every refresh (and local builds can be committed
  directly), so it's never more than a cycle stale. **To update live data now: rebuild locally → `gzip` →
  `git add -f web/data/signals.jsonl.gz web/data/experts.json` → push.** B2 still holds the incremental
  engine-data.tar.gz state, just no longer serves app data.
- **Storage = Backblaze B2** (S3-compatible). GitHub secrets are named `R2_*` (legacy) but point at B2
  (`s3.us-east-005.backblazeb2.com`, bucket `jotter-data`). Files: `signals.jsonl.gz`, `experts.json`,
  `engine-data.tar.gz` (the raw+archive `engine/data/` dir, so runs are incremental and never re-scrape from zero).
- **CI: `.github/workflows/refresh.yml` ("Data refresh")** runs every 4h (+ manual `workflow_dispatch`, optional
  `backfill_ids=a,b,c`). Steps: restore `engine-data.tar.gz` from B2 → `refresh_all.py --no-backfill` → upload data
  back to B2 → **commit the rebuilt `web/data/signals.jsonl.gz`+`experts.json` into the repo** → push an **empty
  commit to trigger a Vercel rebuild** (`permissions: contents:write`; **no `[skip ci]`** — Vercel honours it and
  would skip the build; this workflow only triggers on schedule/dispatch so the bot push can't loop).
- **⚠⚠ THE B2 1 GB/day DOWNLOAD cap — now largely defused (2026-06-10).** `fetch-data.js` no longer downloads from B2
  on the Vercel build at all when a healthy committed `signals.jsonl.gz` exists (it does); it uses the committed file
  and skips the download. That removes the ~32 MB-per-deploy hit that was the main cap-blower (see the authoritative-
  committed-data note up top). The CI `engine-data.tar.gz` restore can still 403 when capped (→ thin ~16k rebuild →
  degraded-guard skips the commit), so CI freshness still depends on the cap, but the LIVE SITE no longer goes stale
  from it. Historical context (mitigations) below still applies to CI:
  (1) `fetch-data.js` uses the **committed** `web/data/signals.jsonl.gz` (force-added to git, tracked despite gitignore);
  (2) CI commits
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
  **⭐ Why LSN looked stuck (2026-06-10):** the scrape works fine (CI got today's 3 signals), but the OVERALL CI build
  was DEGRADED (16,391 < 90% of 25,778) because the B2 `engine-data.tar.gz` restore was capped → thin rebuild → the
  degraded-guard SKIPPED the commit, so live froze on the last good commit (no bot commit since 2026-06-09 14:52).
  Net: LSN (and everything) only refreshes on live when CI commits OR a local build is committed. The committed-data-
  authoritative change above + dropping the per-deploy B2 download should let the cap recover so CI commits resume.
- **Emailed-newsletter pipeline** (`engine/fetch_newsletters.py` + `engine/newsletter_map.json`): dedicated Gmail
  (`jotterintelligence@gmail.com`) over IMAP (secrets `GMAIL_USER`/`GMAIL_APP_PASSWORD`), one source per sender,
  grouping/category/ignore via `newsletter_map.json`, junk-subject filter, `SCHEMA_V` bump = clean re-ingest. Writes
  `data/raw_nl-*.jsonl`+`data/newsletters.json`; `build_dataset` loads the manifest alongside `experts.json`. **Mostly
  unused now** (`groups:[]`; Axios/google/KTN in `ignore_domains`) — promo emails render poorly. `fetch_expert.py`
  also supports `extra_feeds` (list) merged into one source.
  **⚠⚠ THE NEWSLETTER PIPELINE IS NOW FULLY RETIRED (2026-06-10).** Benedict Evans kept appearing on the live site
  months after his removal from experts.json because the Gmail pipeline auto-creates a source per sender (CI-only,
  Gmail creds absent locally, so local builds looked clean). First fix was ignore-list + `SCHEMA_V` 3→4; then the
  user decided no emailed source is wanted at all, so: `refresh_all.py` no longer calls `fetch_newsletters.py`, and
  `build_dataset.py` no longer loads `data/newsletters.json`. The scripts + `newsletter_map.json` remain on disk but
  are dead code; `GMAIL_*` secrets are unused. **experts.json is the ONLY source manifest now.**
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

## ⭐ SESSION 2026-06-10 (pt3): mobile viewport lock + polish
- **⚠ VIEWPORT META WAS MISSING — this was the big mobile bug.** `app/layout.tsx` now exports
  `viewport` (`width:device-width, initialScale:1, maximumScale:1, userScalable:false, viewportFit:cover`). Without it
  mobile browsers assumed a ~980px viewport and shrank the whole desktop layout to fit → the iPhone "off the edge /
  zoom-out to fit / floating nav bar / tiny text" cluster, AND it masked the text-size `zoom` setting (which works now).
  Don't remove this. `viewportFit:cover` powers the `env(safe-area-inset-*)` the tab bar uses.
- **Mobile header:** the weather/time pill is now `hidden md:flex` (desktop-only) — the phone status bar shows the
  time. The three controls (radio · theme · settings) spread across the freed space (`nav` is
  `max-md:flex-1 max-md:justify-around`).
- **Feed filters (mobile):** the 4 controls (All themes · Experts / Years · Newest first) are a 2-col grid filling the
  width (`max-md:grid max-md:grid-cols-2`), not a stack. All four share ONE ▼ chevron — native `<select>`s use
  `appearance-none` + an absolute ▼ so they match the `MultiDropdown` triggers. `MultiDropdown` takes `align`
  ("left"/"right") so its wider-than-cell list opens within the screen (Experts=right, Years=left).
- **Radio sheet (mobile):** Settings footer removed (settings is the header gear on mobile).
- **World Cup countdown DELETED** (`Countdown`/`KICKOFF` gone from `WorldCupChart.tsx`); groups/bracket unchanged.

## ⭐ SESSION 2026-06-10 (pt2): trending diversity, Met Office weather, mobile filters, LSN/B2
- **Trending: per-source cap (`pickDiverse` in `api/trending/route.ts`).** Tabs were colonised by one outlet
  (UK≈all Independent, World≈Independent/AlJazeera, Money≈Bloomberg). `pickDiverse(items, limit, perSource)`
  dedupes near-identical headlines THEN caps each source (categories `perSource=2`, Money `=3`), topping up from the
  capped remainder if too few distinct sources. Applied in the generic category path AND `fetchMoney`. Verified: UK
  now 5 sources ×2, Money = Bloomberg/TradingView/Yahoo/SeekingAlpha.
- **Weather = Met Office model (user choice).** `api/weather/route.ts` now requests Open-Meteo with
  `&models=ukmo_seamless` (UK Met Office UKMO Global 10km + UKV 2km) so values track BBC/Met Office, with a fallback
  to default `best_match` if a point has no UKMO reading. Open-Meteo is just the free delivery pipe. (User explicitly
  rejected the generic Open-Meteo blend; chose the no-key Met Office model over registering a DataHub key.)
- **CollapsibleSection collapse fix v2 + hover-lift room.** v1 broke collapse: the grid item needs **`minHeight:0`**
  (not just minWidth:0) or the 0fr row can't shrink to zero (it stayed 436px). Also moved `setSettled(false)` OUT of
  the `setOpen` updater (updaters must be pure). And added `paddingTop/Bottom:6px` (only when open) + `marginTop:-6`
  on the grid wrapper so `.panel-hover` cards (Latest Insights, markets chips) can lift ~2px on hover without the top
  border being clipped. Verified: collapse 448→0→448; padding 6px when open.
- **Mobile feed filters (`SignalList.tsx` rewrite).** Default mobile view = search bar + Search + feed only. A
  **Filters** button (`md:hidden`, shows active count) expands the tabs + controls full-width. **Select experts / Select
  years are now a `MultiDropdown`** (a checkable list popover, like All-themes), full-width on mobile / anchored on
  desktop — replaced the messy chip-wrap panels. Desktop layout unchanged (tabs left, controls right, no Filters btn).
- **Mobile radio genre pills** are now a single horizontal swipe row (like trending pills), not stacked.
- **⚠ LSN / freshness root cause (the recurring "circles"):** LSN scrape works fine (locally AND from CI). The real
  problem is the **B2 download cap → CI's engine-data.tar.gz restore 403s → thin (~16k) rebuild → degraded-build guard
  SKIPS the commit/publish → live frozen** at the last good commit. Last CI data commit was 2026-06-09 14:52 (none
  since). Two mitigations now in place: (1) `web/scripts/fetch-data.js` **prefers the committed data file** and only
  falls back to B2 if it's absent (so the Vercel build no longer re-downloads 32MB/deploy from B2 — the single biggest
  cap drain, which should let the cap recover and CI resume committing); (2) committing fresh LOCAL builds is the
  reliable update path. **Durable fix still pending: front B2 with Cloudflare (free egress) — user infra task.**
- **WDIM ("What Did I Miss?") prototype is LOCAL-ONLY and intentionally NOT committed.** `web/components/WhatDidIMiss.tsx`,
  `web/lib/wdim.ts`, `web/app/api/wdim/` + the `<WhatDidIMiss/>` line in `web/app/page.tsx` are a working-tree prototype.
  It self-gates to render nothing when `DATA_URL` is set (production). **Do NOT commit until the user says so.**
  - **Format:** three sections **Economy / Consumers / Technology**; each has `data` (1–2 sentences anchored in a hard
    figure) + `insight` (2–3 analytical sentences) + **Key Articles** (3 real source docs with links). UK English, NO
    em dashes, no advice/meta/filler. Three timeframes: **Past Day / Past Week / Past Month** (Past Hour removed).
    **Auto-expanded** by default (`useState(true)` in WhatDidIMiss.tsx).
  - **Grounding:** `api/wdim` aggregates trending headlines (world/business/ft/technology/uk) + `/api/markets` indices
    + `getSignals()` expert signals, and passes them to `generateWdim(range, news, markets)`.
  - **Requires real LLM — no deterministic fallback.** `generateWdim` tries the `claude` CLI
    (`claude-haiku-4-5-20251001`, uses the user's Claude subscription) → `ANTHROPIC_API_KEY`. Returns null (→
    `{available:false}` → component invisible) if neither is available. User has Claude CLI installed and logged in.
  - See [[jotter-wdim-prototype]] for the full state.

## ⭐ MOBILE EXPERIENCE (2026-06-10; everything gated at the `md` 768px breakpoint, desktop untouched)
Below `md` the shell reflows; at/above `md` nothing changed. The pieces:
- **Bottom tab bar** (`components/MobileTabBar.tsx`, rendered in `layout.tsx`, `md:hidden`): Home · Feed · Experts ·
  Publications · Saved as icon+label tabs (same active logic as NavLinks; accent + `color-mix` pill on the active
  icon; `--header-bg`/`--border` vars so every skin styles it). Safe-area padded. The top NavLinks are wrapped in
  `hidden md:flex` in AppHeader; `<main>` gets `max-md:pb-32` to clear the fixed bar (+ mini-player).
- **Radio = bottom sheet on mobile** (all in `RadioSidebar.tsx`; the desktop `<aside>` is `max-md:hidden`, the same
  component instance renders both UIs so playback/state is shared — the detached `new Audio()` doesn't care which UI
  is visible). A **radio button in the header** (mobile only, equalizer icon, accent when playing) toggles the sheet
  via a window event `jotter-radio-toggle`; RadioSidebar broadcasts `jotter-radio-state` ({playing, station}) back.
  The sheet: grab-handle + transport + now-playing row, genres as flex-wrap chips, station search + Index/Favourites
  + full list (sheet body is one scroll region), Settings footer. Backdrop + translateY slide-up, `82dvh` max,
  body scroll locked while open. A **mini-player** (station name + prev/play/next) docks above the tab bar once
  something has played this session (`started` state, so it survives client-side nav but not a full reload).
- **Header ≤md**: logo says just "Jotter" ("Intelligence" is `hidden md:inline`); the WeatherClock pill is now
  visible on mobile in **compact form** (emoji+temp · time; the date segment + its dot are `hidden md:flex`, so the
  calendar panel is desktop-only). A mobile-only **settings gear** sits right of the ThemeToggle (desktop keeps the
  gear in the radio sidebar only). Weather panel columns carry a `.hdr-cols` class: a `@media (max-width:767px)`
  block in globals.css flips the inline grid to a **swipeable flex strip** (`!important`, 3.4rem cols). The world
  clock shows **4 visible cities** on mobile (useVisibleCols matchMedia hook; 11 on desktop), still London-centred.
- **Misc**: `html,body{overflow-x:clip}` ≤767px kills sideways scroll; SignalList's right-hand filter group got
  `flex-wrap max-md:ml-0 max-md:w-full` so the four filter controls wrap instead of clipping. Content grids were
  already responsive (`sm:`/`md:` cols, flex-wrap pills) and needed nothing.
- **Trending rows ≤md**: category pills are ONE swipeable row (`max-md:flex-nowrap overflow-x-auto`, edge-to-edge
  via `-mx-4 px-4`; pills `shrink-0 whitespace-nowrap`); each headline clamps to **two lines** (`max-md:line-clamp-2`,
  desktop keeps `md:truncate`) with the source label moved BENEATH the headline (`block md:hidden`).
- **CollapsibleSection — DO NOT use `overflow:clip` on the inner div (it breaks collapse).** The section animates via
  the CSS-grid trick (outer `grid-template-rows: 0fr↔1fr`, inner `overflow:hidden`). `overflow:hidden` is REQUIRED:
  it makes the inner a scroll container, which zeroes its automatic **min-width AND min-height** — so (a) the `0fr`
  row collapses to 0 height, and (b) a wide child (the swipeable trending-pills row) can't blow the panel past its
  container width (this is also what lets mobile headlines wrap to 2 lines). A 2026-06-10 attempt to fix the
  hover-lift clip by switching to `overflow:clip` + `overflowY:visible`/`settled` flag SHIPPED A REGRESSION: `clip`
  is not a scroll container, so min-height stayed `auto` and **sections stopped collapsing entirely on the live
  site**. Reverted to plain `overflow:hidden`. The panel hover-lift being clipped at the top is a known minor
  cosmetic trade-off; if revisited, do it WITHOUT changing the inner overflow (e.g. padding the clip box), and test
  collapse in a REAL browser (the headless preview has a `grid-template-rows` fr-transition quirk that makes it look
  stuck open even when the code is correct — verify via `transition:none` forcing or a real browser).
- **World Cup groups fix:** ESPN's standings API nests rows at `children[].standings.entries`; the route only read
  `group.entries`, so all 12 groups rendered empty. `/api/worldcup` now falls back to `group.standings.entries`.
  (NB route caches in globalThis — restart dev server after editing it.)
- **Mobile radio = sheet only, no persistent player (2026-06-10):** the docked mini-player above the tab bar was
  removed per request. On mobile the radio is shown ONLY via the slide-up sheet, toggled on/off by the header radio
  button (`jotter-radio-toggle` event). Closing the sheet leaves audio playing (header button lights gold via
  `jotter-radio-state`) but nothing is docked on the page. (`started` state deleted.)
- **Trending source changes (2026-06-10):** **Digital Trends removed** from `technology`. **Money (`ft`) is now a
  CUSTOM fetcher `fetchMoney`** (was a plain RSS list incl. MarketWatch/Forbes/FT/WSJ/Economist — all replaced).
  It pulls Yahoo Finance, Bloomberg, Seeking Alpha, TradingView (`site:tradingview.com/news`) via Google News RSS
  site-search (reliable from datacenter IPs, like `fetchReuters`), strips the trailing " - Publisher", merges
  newest-first + dedupes, and drops portal/chart/ticker noise via `MONEY_JUNK`. **Google Finance was requested but
  has no article feed of its own (it's a portal), so it is NOT included** — tell the user if they ask; a different
  quality finance source can fill the 5th slot.
- **Ethan Mollick added** as an author (`ethanmollick`, One Useful Thing, oneusefulthing.org, rss + substack
  backfill; 135 signals 2022→). 33 experts / ~25.9k signals now.
- **Weather (2026-06-10):** the SOURCE is now the Met Office UKMO model (`&models=ukmo_seamless`) — see the
  "Met Office model" note in the pt2 session above (this earlier note is superseded; a first pass kept `best_match`,
  then the user asked for Met Office). Other still-valid fixes: (1) hourly "NOW" `startIdx` now uses `j.current.time`
  (local tz) not a UTC `now()` (was off by the UTC offset, e.g. 1h in BST); (2) server cache TTL 20→10 min;
  (3) WeatherClock refetches every 15 min so an open tab stays live. NB this sandbox serves synthetic 2026-dated data.
- `.claude/launch.json` (in `~/Claude Code Experiments/`) defines the `jotter-web` preview server
  (`npm run dev --prefix jotter-intelligence/web`, port 3000) for Claude's preview tooling.

## ⭐ SESSION 2026-06-11: UI overhaul + inline images

### Inline image rendering in the Feed
- **`engine/build_dataset.py`**: before HTML tag-stripping, `clean_block()` now converts `<figure>/<img>` tags to
  `![alt](url)` markdown inline using three helpers: `_img_url_ok()` (skips data-URIs, SVGs, CDN thumbs),
  `_img_tag_to_md()`, `_figure_to_md()`. Images appear at their authored position in the signal text.
  After rebuild: 5,060 of 26,301 signals carry inline `![` markers.
- **`web/components/SignalCard.tsx`**: `renderWithLinks()` → `renderBody()`. Combined `INLINE` regex handles
  both `[text](url)` links AND `![alt](url)` images in one pass. Images render as `<figure><img loading="lazy"/></figure>`
  at original position. `demd()` strips images from truncated previews. The trailing-images fallback block is now
  gated on `!s.text.includes("![")` (still works for pre-rebuild signals in the dataset).

### WDIM ("What Did I Miss?") — overhaul in previous session (2026-06-10 evening), finalised here
- **Deterministic fallback removed entirely.** WDIM now requires the `claude` CLI (using the user's subscription)
  or `ANTHROPIC_API_KEY`. Returns `{available:false}` (→ invisible) if neither is available.
  User installed Claude Code CLI (`npm i -g @anthropic-ai/claude-code`) and completed setup. CLI works.
- **Model: `claude-haiku-4-5-20251001`** for speed. Override via `WDIM_MODEL` env var.
- **Three timeframes: Past Day / Past Week / Past Month.** "Past Hour" was removed.
- **WDIM is now auto-expanded** (`useState(true)`) — the brief is visible immediately on page load.
- **No metadata footer** (sources count + timestamp removed). **Key Articles** box replaces "Key Pieces".
- **URL attachment**: `buildUrlMap()` builds a `title → post_url` map from signals + news; `attachUrls()`
  patches piece links after AI parse (more reliable than asking the model to reproduce URLs).
- **`wdimReady()`** checks `getSignals().length > 0` (NOT `recentForSynthesis` — that caused a false-negative bug).
- **Background prefetch**: on mount, fetches `day` with spinner, then after 1.5s silently fires `week` + `month`.

### News & Insights — combined module replacing Trending News + Latest Insights
- **`TrendingAndInsights.tsx`** (new component) replaces the separate `CollapsibleSection title="Trending News"` +
  `CollapsibleSection title="Latest Insights"` sections on the home page.
- **Header**: `h2` "News & Insights" + inline toggle pills **[News] [Insights]** + collapse chevron.
- **News view**: unchanged `TrendingWidget` (category pills, live headlines).
- **Insights view**: source-filter pills (one per expert/publication, ordered by most recently published,
  no "All" pill) + a `divide-y` list identical in format to Trending News rows (headline, context snippet,
  source label, archive-search icon, links to `post_url`).
  - Pills show **author name only** — the `(blog name)` parenthetical is stripped (`source.replace(/\s*\([^)]*\)\s*$/, "")`).
  - Source pills use `pb-0.5` (no `-mx-4`) to avoid the `overflow-y:auto` clip that `overflow-x:auto` triggers.
  - Context snippets strip images by filtering lines starting with `![` before any URL-regex work (avoids CDN
    `:stripexif():stripicc()` artefacts that contain `)` and break simpler URL-stripping regexes).
  - **Source label removed from list rows** — it's redundant when the selected pill already identifies the author.
- **Data**: `page.tsx` now calls `getRecentFeed(365, 10)` — up to 10 per source scanning a full year — so
  infrequent authors (weekly/bi-weekly) reliably get 10 articles, not 3–4 from the old 30-day window.
- **`LatestInsights.tsx` is no longer used on the home page** (file still exists; it's still used nowhere —
  safe to delete later). The standalone Latest Insights CollapsibleSection is gone from `page.tsx`.

---

## ⭐ HOME + UI CHANGES THIS SESSION
- **Home "Latest Insights" — replaced by TrendingAndInsights Insights tab** (see session 2026-06-11 above).
  Old `getLatestPerExpert(7)` pattern is gone; home now uses `getRecentFeed(365, 10)` via `TrendingAndInsights`.
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
                             SignalCard, SignalList, TrendingWidget, TrendingAndInsights (home News+Insights toggle),
                             MarketsSnapshot, CollapsibleSection, WhatDidIMiss, WorldCupChart,
                             SourcesGrid, SourceProfile, ExpertAdmin, NavLinks, MobileTabBar, RadioSidebar, CtaFooter,
                             Logo, ThemeToggle, ui
                             (deleted: AskPanel, Generator, WeeklySynthesis, DailyIntelligence, OpenDataCard,
                              OpenDataExplorer, TrendExplorer, ThemeTrendsChart, WeatherIcon,
                              LatestInsights, PdfUpload, ThemeHeatmap [cleanup 2026-06-12])
  lib/data.ts                server-only: MERGE engine data + uploads store; searchSignals; getRecentFeed;
                             suggestedSearches; recentForSynthesis (WDIM); getOverview; mtime cache
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
- `/` Home: **News & Insights** (TrendingAndInsights — toggle between live Trending News and Latest Insights source-browser) · **What Did I Miss?** (WDIM, local-only, auto-expanded) · **Markets** (MarketsSnapshot, auto-expands first chart) · **World Cup 2026** (collapsed by default) · CtaFooter.
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
  also scrapped because the user won't spend time digging through datasets. (The now-dead `topicTrends()`/
  `themeHeatmap()`/`themeTrends()` helpers were deleted from `lib/data.ts` in the 2026-06-12 cleanup.) **The current
  nav is just Home · Feed · Experts · Publications · Saved.** If a data/insight surface is wanted again, start fresh.
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
- **Dead-code cleanup DONE (2026-06-12):** deleted `LatestInsights.tsx`, `PdfUpload.tsx`, `ThemeHeatmap.tsx`
  (0 imports) and pruned ~500 lines of dead helpers from `lib/data.ts` (`recentSignals`, `weeklySummary`,
  `weeklyBriefing`, `getLatestPerExpert`, `suggestedPrompts`, `themeTrends`, `topicTrends`, `themeHeatmap`,
  `latestFeed`, `weeklyThreads` + their types). `lib/data.ts` is now 316 lines. `/api/upload-pdf` + `/api/sources`
  are KEPT (ExpertAdmin calls them directly for the in-app doc-upload flow). Verified: tsc clean, build green.
- **`lib/uploads.ts refreshFeeds()` RE-WIRED (2026-06-12):** it had become orphaned (the route only spawned the Python
  scripts), so in-app uploaded-RSS feeds stopped auto-refreshing. `/api/refresh/route.ts` now calls
  `await refreshFeeds().catch(() => [])` after the engine build and returns `{ refreshed, feeds }`, restoring the
  documented behavior. (Dev-only path — production returns early when `DATA_URL` is set.)
- **Remaining `npm run lint` noise is intentional:** 17 `react-hooks/set-state-in-effect` errors are all mount-time
  localStorage hydration / clock-tick / prefetch effects (correct patterns, not bugs); Next 16 `next build` doesn't run
  eslint so they don't block deploy. Left as-is. The build-script `require()` false-positives and unused-var/`_`-omit
  noise were cleared via `eslint.config.mjs` (ignore `scripts/**`, `ignoreRestSiblings`, `^_` patterns).
- **Postgres + pgvector migration (gated on infra).** Schema at `web/db/schema.sql`. NOT built: the loader and the
  DB-backed data layer behind a `DATABASE_URL` flag. NB semantic/RAG would re-introduce an embeddings API — keep it
  deterministic-first per the LLM-free goal. Lower priority than deploy.
- In-app RSS auto-refresh only pulls latest ~30/run (no deep history).

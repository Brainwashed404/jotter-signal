#!/usr/bin/env python3
"""
Refresh all experts: fetch recent RSS, backfill archives, then rebuild dataset.
Run from the engine/ directory: python3 refresh_all.py

Flags:
  --no-backfill   skip backfill step (faster, RSS-only refresh)
  --ids a,b,c     only process these expert IDs
"""
import json, os, subprocess, sys, time

DELAY = 2  # seconds between network calls (be polite)

def run(cmd, **kw):
    print(f"  $ {' '.join(cmd)}")
    result = subprocess.run(cmd, **kw)
    if result.returncode != 0:
        print(f"  ! exited {result.returncode}")
    return result.returncode == 0

def main():
    args = sys.argv[1:]
    do_backfill = "--no-backfill" not in args
    filter_ids = None
    if "--ids" in args:
        idx = args.index("--ids")
        filter_ids = set(args[idx + 1].split(","))

    experts = json.load(open("experts.json"))
    if filter_ids:
        experts = [e for e in experts if e["id"] in filter_ids]

    print(f"=== refresh_all: {len(experts)} expert(s), backfill={'yes' if do_backfill else 'no'} ===\n")

    for ex in experts:
        eid = ex["id"]
        adapter = ex.get("adapter", "rss")

        # naughton uses its own dedicated fetcher
        if adapter == "naughton":
            print(f"[{eid}] fetch_meta + fetch_full")
            run(["python3", "fetch_meta.py"])
            time.sleep(DELAY)
            run(["python3", "fetch_full.py"])
        else:
            print(f"[{eid}] fetch_expert")
            run(["python3", "fetch_expert.py", eid])

        time.sleep(DELAY)

        # Always backfill feed-less sources (e.g. LSN): the backfill is their ONLY
        # data source, so skipping it on --no-backfill runs freezes them.
        if ex.get("backfill") and (do_backfill or not ex.get("feed")):
            print(f"[{eid}] backfill ({ex['backfill']})")
            run(["python3", "backfill.py", eid])
            time.sleep(DELAY)

        print()

    # Newsletter ingest (fetch_newsletters.py) is RETIRED: emailed newsletters render
    # poorly and kept resurrecting removed sources (Benedict Evans). The script and
    # newsletter_map.json are kept on disk but are no longer called, and build_dataset
    # no longer loads data/newsletters.json.

    # Refresh the baked Reddit headlines (via rss2json, works from any IP).
    print("=== fetch_reddit ===")
    run(["python3", "fetch_reddit.py"])
    print()

    print("=== build_dataset ===")
    run(["python3", "build_dataset.py"])
    print("\nDone. Restart the dev server to reload signals.")

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    main()

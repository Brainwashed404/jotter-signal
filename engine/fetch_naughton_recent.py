#!/usr/bin/env python3
"""Incrementally fetch only NEW Naughton (Memex 1.1) posts and append them to
data/posts_full.jsonl. Cheap enough to run on every auto-refresh — unlike
fetch_full.py, which re-scrapes the whole ~13k-post archive.

Strategy: pull the most recent posts (newest first) and keep those whose id we
don't already have, stopping once we hit posts we've seen.
"""
import json, os, time, urllib.request, urllib.error

BASE = "https://memex.naughtons.org/wp-json/wp/v2/posts"
FIELDS = "id,date,link,title,content,categories,tags"
OUT = "data/posts_full.jsonl"
PER_PAGE = 100

def fetch(page):
    url = f"{BASE}?per_page={PER_PAGE}&page={page}&orderby=date&order=desc&_fields={FIELDS}"
    req = urllib.request.Request(url, headers={"User-Agent": "personal-research-archive/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode())

def main():
    have = set()
    if os.path.exists(OUT):
        for l in open(OUT):
            try: have.add(json.loads(l)["id"])
            except Exception: pass

    fresh, page = [], 1
    while page <= 5:  # safety cap; new posts since last refresh are always on page 1–2
        try:
            items = fetch(page)
        except urllib.error.HTTPError as e:
            if e.code == 400: break
            raise
        if not items:
            break
        new = [it for it in items if it["id"] not in have]
        fresh += new
        # If this page had any already-seen posts, everything older is seen too — stop.
        if len(new) < len(items):
            break
        page += 1
        time.sleep(0.4)

    if fresh:
        with open(OUT, "a") as f:
            for it in fresh:
                f.write(json.dumps(it) + "\n")
    print(f"naughton: {len(fresh)} new post(s) appended -> {OUT}")

if __name__ == "__main__":
    main()

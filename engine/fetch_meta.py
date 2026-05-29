#!/usr/bin/env python3
"""Fetch lightweight metadata for every post in the Memex 1.1 archive.

Uses the WordPress REST API with _fields to keep payloads small, so we can
mirror all ~13k posts' (date, title, excerpt, categories) in ~131 requests.
This is enough to compute real theme trajectories across 24 years.
"""
import json, time, sys, urllib.request, urllib.error

BASE = "https://memex.naughtons.org/wp-json/wp/v2/posts"
FIELDS = "id,date,link,title,excerpt,categories,tags"
PER_PAGE = 100
OUT = "data/posts_meta.jsonl"

def fetch(page):
    url = f"{BASE}?per_page={PER_PAGE}&page={page}&orderby=date&order=asc&_fields={FIELDS}"
    req = urllib.request.Request(url, headers={"User-Agent": "personal-research-archive/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        total_pages = int(r.headers.get("X-WP-TotalPages", "0"))
        return json.loads(r.read().decode()), total_pages

def main():
    page = 1
    total_pages = None
    n = 0
    with open(OUT, "w") as f:
        while True:
            try:
                items, total_pages = fetch(page)
            except urllib.error.HTTPError as e:
                if e.code == 400:  # past last page
                    break
                raise
            if not items:
                break
            for it in items:
                f.write(json.dumps(it) + "\n")
                n += 1
            print(f"page {page}/{total_pages}  posts so far: {n}", flush=True)
            if total_pages and page >= total_pages:
                break
            page += 1
            time.sleep(0.4)  # be polite to a one-person site
    print(f"DONE: {n} posts -> {OUT}")

if __name__ == "__main__":
    main()

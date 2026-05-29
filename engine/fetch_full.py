#!/usr/bin/env python3
"""Fetch full content for every post. Heavier payloads but still ~131 requests."""
import json, time, urllib.request, urllib.error

BASE = "https://memex.naughtons.org/wp-json/wp/v2/posts"
FIELDS = "id,date,link,title,content,categories,tags"
PER_PAGE = 100
OUT = "data/posts_full.jsonl"

def fetch(page):
    url = f"{BASE}?per_page={PER_PAGE}&page={page}&orderby=date&order=asc&_fields={FIELDS}"
    req = urllib.request.Request(url, headers={"User-Agent": "personal-research-archive/1.0"})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read().decode()), int(r.headers.get("X-WP-TotalPages","0"))

def main():
    page, n = 1, 0
    with open(OUT, "w") as f:
        while True:
            try:
                items, tp = fetch(page)
            except urllib.error.HTTPError as e:
                if e.code == 400: break
                raise
            if not items: break
            for it in items:
                f.write(json.dumps(it) + "\n"); n += 1
            print(f"page {page}/{tp}  posts: {n}", flush=True)
            if tp and page >= tp: break
            page += 1; time.sleep(0.4)
    print(f"DONE: {n} -> {OUT}")

if __name__ == "__main__":
    main()

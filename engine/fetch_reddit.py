#!/usr/bin/env python3
"""Fetch the Jotter curated multireddit for the Trending News "Reddit" tab.

Reddit blocks direct fetches from cloud IPs, so we relay through rss2json (works
from any IP — CI included). Writes web/lib/reddit-trending.json, which is committed
and bundled into the build; /api/trending serves it for the Reddit tab.

Source = the public multireddit:
  reddit.com/user/fluffy-earth-8062/m/jotter_intelligence/new
"""
import json, os, re, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "lib", "reddit-trending.json")
MULTI_RSS = "https://www.reddit.com/user/fluffy-earth-8062/m/jotter_intelligence/new/.rss"
UA = "Mozilla/5.0 (compatible; jotter-intelligence/1.0)"

STOP = {"The","A","An","How","Why","What","When","Who","Where","New","This","That","Live","Watch",
        "Could","Will","Has","Have","Is","Are","To","In","On","Of","For","And","But","After","Before",
        "Says","My","Your","It","We","They","Best","First","Here","These","Now","Over","With"}


def term_of(title):
    for e in re.findall(r"\b[A-Z][a-zA-Z0-9.&'-]+(?:\s+[A-Z][a-zA-Z0-9.&'-]+){0,3}\b", title):
        words = [w for w in e.split() if w not in STOP]
        phrase = " ".join(words).strip(" '")
        if len(phrase) > 3:
            return phrase
    return " ".join(w for w in title.split() if len(w) > 3 and w not in STOP)[:40]


def fetch_items():
    url = "https://api.rss2json.com/v1/api.json?rss_url=" + urllib.parse.quote(MULTI_RSS, safe="")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=25) as r:
        data = json.loads(r.read())
    if data.get("status") != "ok":
        return []
    out, seen = [], set()
    for it in data.get("items", []):
        title = re.sub(r"\s+", " ", (it.get("title") or "")).strip()
        link = (it.get("link") or "").strip()
        if len(title) < 12 or not link:
            continue
        key = title.lower()[:40]
        if key in seen:
            continue
        seen.add(key)
        out.append({"title": title, "url": link, "source": "Reddit", "term": term_of(title), "date": ""})
        if len(out) >= 10:
            break
    return out


def main():
    try:
        items = fetch_items()
    except Exception as e:
        print(f"[reddit] fetch failed ({e}) — keeping existing file")
        return
    if not items:
        print("[reddit] 0 items — keeping existing file")
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(items, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"[reddit] wrote {len(items)} headlines from the jotter_intelligence multireddit")


if __name__ == "__main__":
    main()

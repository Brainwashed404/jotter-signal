#!/usr/bin/env python3
"""Fetch Reddit 'rising' headlines for the Trending News widget.

Reddit blocks datacenter IPs (Vercel runtime AND GitHub CI), so the widget can't
fetch it live. Instead this runs from a residential IP (your machine, via
publish.sh) and writes a small baked file the widget serves. Refreshes whenever
you run publish.sh.

Output: web/lib/reddit-trending.json  (committed, bundled into the build)
"""
import json, os, re, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "web", "lib", "reddit-trending.json")
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

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


# Reddit's own JSON/RSS blocks most clients. Redlib (open-source Reddit front-end)
# serves clean RSS and works from a residential IP. Try instances in order.
REDLIB_HOSTS = ["https://redlib.perennialte.ch", "https://redlib.r4fo.com", "https://redlib.privacyredirect.com"]


def fetch(subreddit, sort):
    for host in REDLIB_HOSTS:
        try:
            req = urllib.request.Request(f"{host}/r/{subreddit}.rss?sort={sort}", headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=20) as r:
                xml = r.read().decode("utf-8", "replace")
        except Exception:
            continue
        out, seen = [], set()
        for block in re.split(r"<item[\s>]", xml)[1:]:
            tm = re.search(r"<title>(.*?)</title>", block, re.S)
            lm = re.search(r"<link>(.*?)</link>", block, re.S)
            if not tm:
                continue
            title = re.sub(r"<!\[CDATA\[|\]\]>", "", tm.group(1)).strip()
            title = re.sub(r"&amp;", "&", title)
            if len(title) < 12:
                continue
            url = (lm.group(1).strip() if lm else "")
            key = title.lower()[:40]
            if key in seen:
                continue
            seen.add(key)
            out.append({"title": title, "url": url, "source": "Reddit", "term": term_of(title), "date": ""})
            if len(out) >= 10:
                break
        if out:
            return out
    return []


def main():
    items = fetch("news", "rising")
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(items, open(OUT, "w"), indent=1, ensure_ascii=False)
    print(f"[reddit] wrote {len(items)} headlines -> {os.path.relpath(OUT, HERE)}")


if __name__ == "__main__":
    main()

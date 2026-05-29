#!/usr/bin/env python3
"""Fetch an expert's RSS/Atom feed into a normalised raw file.

Usage: python3 fetch_expert.py <expert_id>      (or no arg = all rss experts)
Output: data/raw_<id>.jsonl  with {title, link, date, content, categories}

Substack feeds live at https://NAME.substack.com/feed — same shape as this.
"""
import json, sys, urllib.request, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime

NS = {"content": "http://purl.org/rss/1.0/modules/content/"}

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "jotter-intelligence/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def parse(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = []
    for it in root.iter("item"):  # RSS
        title = (it.findtext("title") or "").strip()
        link = (it.findtext("link") or "").strip()
        pub = it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date") or ""
        content = it.findtext("content:encoded", default="", namespaces=NS) or it.findtext("description") or ""
        cats = [c.text for c in it.findall("category") if c.text]
        try:
            date = parsedate_to_datetime(pub).isoformat()
        except Exception:
            date = pub
        items.append({"title": title, "link": link, "date": date, "content": content, "categories": cats})
    return items

def run(expert):
    if expert.get("adapter") != "rss":
        return
    print(f"fetching {expert['id']} <- {expert['feed']}")
    items = parse(fetch(expert["feed"]))
    out = f"data/raw_{expert['id']}.jsonl"
    with open(out, "w") as f:
        for it in items:
            if it["date"]:
                f.write(json.dumps(it) + "\n")
    print(f"  {len(items)} items -> {out}")

def main():
    experts = json.load(open("experts.json"))
    want = sys.argv[1] if len(sys.argv) > 1 else None
    for ex in experts:
        if want and ex["id"] != want:
            continue
        if ex.get("adapter") == "rss":
            run(ex)

if __name__ == "__main__":
    main()

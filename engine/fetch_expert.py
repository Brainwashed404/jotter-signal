#!/usr/bin/env python3
"""Fetch an expert's RSS/Atom feed into a normalised raw file.

Usage: python3 fetch_expert.py <expert_id>      (or no arg = all rss experts)
Output: data/raw_<id>.jsonl  with {title, link, date, content, categories}

Substack feeds live at https://NAME.substack.com/feed — same shape as this.
"""
import json, sys, urllib.request, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

NS = {"content": "http://purl.org/rss/1.0/modules/content/"}
A = "{http://www.w3.org/2005/Atom}"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "jotter-intelligence/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()

def to_iso(s):
    s = (s or "").strip()
    if not s:
        return ""
    try:
        return parsedate_to_datetime(s).isoformat()
    except Exception:
        pass
    for fmt in ("%a, %d %b %Y", "%d %b %Y", "%Y-%m-%d", "%a, %d %b %Y %H:%M:%S"):
        try:
            return datetime.strptime(s, fmt).isoformat()
        except Exception:
            pass
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).isoformat()
    except Exception:
        return s

def parse(xml_bytes):
    root = ET.fromstring(xml_bytes)
    tag = root.tag.lower()
    items = []
    if tag.endswith("rss") or root.find("channel") is not None:
        for it in root.iter("item"):
            content = it.findtext("content:encoded", default="", namespaces=NS) or it.findtext("description") or ""
            items.append({
                "title": (it.findtext("title") or "").strip(),
                "link": (it.findtext("link") or "").strip(),
                "date": to_iso(it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date") or ""),
                "content": content,
                "categories": [c.text for c in it.findall("category") if c.text],
            })
    else:  # Atom
        for it in root.findall(f"{A}entry"):
            link = ""
            for l in it.findall(f"{A}link"):
                if l.get("rel") in (None, "alternate"):
                    link = l.get("href") or ""
                    break
            content = it.findtext(f"{A}content") or it.findtext(f"{A}summary") or ""
            items.append({
                "title": (it.findtext(f"{A}title") or "").strip(),
                "link": link,
                "date": to_iso(it.findtext(f"{A}published") or it.findtext(f"{A}updated") or ""),
                "content": content,
                "categories": [c.get("term") for c in it.findall(f"{A}category") if c.get("term")],
            })
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

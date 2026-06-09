#!/usr/bin/env python3
"""Fetch an expert's RSS/Atom feed into a normalised raw file.

Usage: python3 fetch_expert.py <expert_id>      (or no arg = all rss experts)
Output: data/raw_<id>.jsonl  with {title, link, date, content, categories}

Substack feeds live at https://NAME.substack.com/feed — same shape as this.
"""
import json, os, sys, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from datetime import datetime, timezone

NS = {"content": "http://purl.org/rss/1.0/modules/content/"}
A = "{http://www.w3.org/2005/Atom}"

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "jotter-intelligence/1.0"})
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read()

# Substack (and a few others) block datacenter IPs, so a direct fetch 403s in CI but
# works from a home IP. rss2json relays the fetch from a non-blocked IP and returns
# parsed JSON, so it's an automatic fallback that keeps every source working in CI
# with no manual step. Free, no key, used only when the direct fetch fails/empties.
def fetch_via_rss2json(feed_url):
    raw = fetch("https://api.rss2json.com/v1/api.json?rss_url=" + urllib.parse.quote(feed_url, safe=""))
    data = json.loads(raw)
    if data.get("status") != "ok":
        return []
    out = []
    for it in data.get("items", []):
        out.append({
            "title": (it.get("title") or "").strip(),
            "link": (it.get("link") or "").strip(),
            "date": to_iso(it.get("pubDate") or ""),
            "content": it.get("content") or it.get("description") or "",
            "categories": it.get("categories") or [],
        })
    return out

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
    # Fetch any expert that has a feed — covers adapter "rss" AND "doctorow"
    # (Pluralistic), whose recent posts arrive via RSS even though it's atomised
    # with a custom builder. Naughton has no feed (use fetch_naughton_recent.py).
    # A source can have one primary `feed` plus optional `extra_feeds` (e.g. a
    # newsletter routed through an email->RSS bridge). All merge into one raw file
    # so the content sits under a single source profile.
    feeds = ([expert["feed"]] if expert.get("feed") else []) + list(expert.get("extra_feeds", []))
    if not feeds:
        return
    out = f"data/raw_{expert['id']}.jsonl"
    fresh = []
    for furl in feeds:
        print(f"fetching {expert['id']} <- {furl}")
        items = []
        try:
            items = [it for it in parse(fetch(furl)) if it["date"]]
        except Exception as e:
            print(f"  ! direct fetch failed ({e})")
        if not items:
            # Blocked (e.g. Substack 403s the CI IP) or empty — relay via rss2json.
            try:
                items = [it for it in fetch_via_rss2json(furl) if it["date"]]
                if items:
                    print(f"  ✓ {len(items)} via rss2json fallback")
            except Exception as e:
                print(f"  ! rss2json fallback failed ({e})")
        fresh += items
    # Never overwrite good data with an empty/failed parse (transient feed hiccup).
    if not fresh:
        print(f"  0 items — keeping existing {out}")
        return
    # Append-dedupe: merge with existing file so history accumulates across runs.
    existing = []
    if os.path.exists(out):
        try:
            existing = [json.loads(l) for l in open(out)]
        except Exception:
            pass
    def key(it):
        return (it.get("link", "") or "").rstrip("/") or it.get("title", "")[:60]
    existing_keys = {key(it) for it in existing}
    new_count = sum(1 for it in fresh if key(it) not in existing_keys)
    seen = set()
    items = []
    for it in fresh + existing:
        k = key(it)
        if k in seen:
            continue
        seen.add(k)
        items.append(it)
    with open(out, "w") as f:
        for it in items:
            f.write(json.dumps(it) + "\n")
    print(f"  +{new_count} new, {len(items)} total -> {out}")

def main():
    experts = json.load(open("experts.json"))
    want = sys.argv[1] if len(sys.argv) > 1 else None
    failures = 0
    for ex in experts:
        if want and ex["id"] != want:
            continue
        if not ex.get("feed"):
            continue
        # Isolate each feed: one dead/slow/404 feed must NOT abort the whole refresh.
        try:
            run(ex)
        except Exception as e:
            failures += 1
            print(f"  ! {ex['id']} fetch failed ({type(e).__name__}: {str(e)[:80]}) — skipping")
    if failures:
        print(f"done with {failures} feed failure(s)")

if __name__ == "__main__":
    main()

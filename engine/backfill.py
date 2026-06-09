#!/usr/bin/env python3
"""Deep-backfill an expert's historical archive (beyond the ~20 recent RSS items).

- Substack publications (incl. custom domains): paginate /api/v1/archive, then
  fetch each free post's full body via /api/v1/posts/<slug>.
- WordPress publications (e.g. Pluralistic): paginate the wp-json REST API.

Writes data/archive_<id>.jsonl (merged with recent RSS at build time, deduped).
Usage: python3 backfill.py [expert_id]
"""
import json, sys, time, urllib.request, urllib.error

UA = {"User-Agent": "Mozilla/5.0 jotter-intelligence/1.0"}
SUBSTACK_CAP = 300   # max posts per expert (bounds runtime/requests)
WP_CAP = 600

def get(u):
    req = urllib.request.Request(u, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read()

def backfill_substack(ex):
    base = ex["url"].rstrip("/")
    cap = ex.get("cap", SUBSTACK_CAP)
    posts, offset = [], 0
    while len(posts) < cap:
        try:
            batch = json.loads(get(f"{base}/api/v1/archive?sort=new&limit=12&offset={offset}"))
        except Exception as e:
            print(f"  archive error at offset {offset}: {e}"); break
        if not batch:
            break
        posts += batch
        offset += 12   # Substack pages at 12 per request
        time.sleep(0.2)
    posts = posts[:cap]
    out = []
    for i, p in enumerate(posts):
        slug = p.get("slug"); title = p.get("title") or ""
        date = p.get("post_date") or ""
        link = p.get("canonical_url") or ""
        body = ""
        if p.get("audience") == "everyone" and slug:
            try:
                d = json.loads(get(f"{base}/api/v1/posts/{slug}"))
                body = (d.get("post") or d).get("body_html") or ""
            except Exception:
                body = ""
            time.sleep(0.15)
        if not body and link:
            # For paid posts the API only returns a short truncated_body_text.
            # Fetch the public HTML page instead — it contains the full free preview.
            try:
                import re as _re
                html = get(link).decode("utf-8", errors="replace")
                m = _re.search(r"<article[^>]*>([\s\S]+?)</article>", html, _re.I)
                if m:
                    art = m.group(1)
                    # strip from paywall gate onward
                    gate = _re.search(
                        r"<[^>]+>(?:This post is for paid subscribers?|Subscribe to continue reading)[^<]*</[^>]+>",
                        art, _re.I
                    )
                    if gate:
                        art = art[:gate.start()]
                    body = art.strip()
            except Exception:
                body = ""
            time.sleep(0.2)
        if not body:
            body = p.get("truncated_body_text") or p.get("description") or ""
        if not (date and (title or body)):
            continue
        out.append({"title": title, "link": link, "date": date, "content": body,
                    "categories": [], "audience": p.get("audience", "")})
        if (i + 1) % 25 == 0:
            print(f"  …{i + 1}/{len(posts)}")
    return out

def backfill_wordpress(ex):
    base = ex.get("wp", ex["url"].rstrip("/"))
    cap = ex.get("cap", WP_CAP)
    out, page = [], 1
    while len(out) < cap:
        url = f"{base}/wp-json/wp/v2/posts?per_page=100&page={page}&_fields=date,link,title,content"
        try:
            batch = json.loads(get(url))
        except urllib.error.HTTPError as e:
            if e.code == 400:
                break
            raise
        if not batch:
            break
        for r in batch:
            out.append({"title": r["title"]["rendered"], "link": r["link"],
                        "date": r["date"], "content": r["content"]["rendered"], "categories": []})
        print(f"  …page {page} ({len(out)})")
        page += 1
        time.sleep(0.3)
    return out[:cap]

import re as _re
def backfill_protein(ex):
    """Scrape a JS-light WordPress tag archive (REST disabled): paginate the tag
    listing for article slugs, then pull each article's server-rendered body."""
    listing = ex["url"].rstrip("/")
    host = "https://www.protein.xyz"
    NAV = {"/contribute/", "/about/", "/membership/", "/contact/", "/privacy-policy/",
           "/terms/", "/jobs/", "/shop/", "/login/", "/sign-up/", "/account/", "/seeds/"}
    slugs = []
    for p in range(1, 60):
        url = listing + "/" if p == 1 else f"{listing}/page/{p}/"
        try:
            h = get(url).decode("utf-8", "replace")
        except Exception:
            break
        found = [s for s in dict.fromkeys(_re.findall(r'href="(/[a-z0-9][a-z0-9-]{5,}/)"', h)) if s not in NAV]
        new = [s for s in found if s not in slugs]
        if p > 1 and not new:
            break
        slugs += new
        time.sleep(0.2)
    print(f"  {len(slugs)} article slugs")
    out = []
    for i, slug in enumerate(slugs):
        try:
            a = get(host + slug).decode("utf-8", "replace")
        except Exception:
            continue
        md = (_re.search(r'<meta property="article:published_time" content="([^"]*)"', a)
              or _re.search(r'"datePublished"\s*:\s*"([^"]+)"', a))
        mc = _re.search(r"<article[^>]*>(.*?)</article>", a, _re.S)
        if not (md and mc):
            continue
        mt = _re.search(r'<meta property="og:title" content="([^"]*)"', a)
        title = (mt.group(1) if mt else slug.strip("/")).replace(" - Protein", "").strip()
        out.append({"title": title, "link": host + slug, "date": md.group(1),
                    "content": mc.group(1), "categories": ["SEEDS"]})
        time.sleep(0.15)
        if (i + 1) % 20 == 0:
            print(f"  …{i + 1}/{len(slugs)}")
    return out

def backfill_wpcom(ex):
    """WordPress.com-hosted sites (own REST disabled) via the public API."""
    site = ex["wpcom"]
    cap = ex.get("cap", WP_CAP)
    out, page = [], 1
    while len(out) < cap:
        url = f"https://public-api.wordpress.com/wp/v2/sites/{site}/posts?per_page=100&page={page}&_fields=date,link,title,content"
        try:
            batch = json.loads(get(url))
        except urllib.error.HTTPError as e:
            if e.code in (400, 403):
                break
            raise
        if not batch:
            break
        for r in batch:
            out.append({"title": r["title"]["rendered"], "link": r["link"],
                        "date": r["date"], "content": r["content"]["rendered"], "categories": []})
        print(f"  …page {page} ({len(out)})")
        page += 1
        time.sleep(0.3)
    return out[:cap]

def backfill_squarespace(ex):
    """Squarespace collections (e.g. ben-evans.com essays) via the public
    ?format=json pagination. Each page returns up to 10 items with full HTML
    `body`; `nextPageOffset` (publishOn epoch-ms of the last item) pages back."""
    base = ex.get("squarespace", ex["feed"].split("?")[0])  # collection URL, no query
    if base.startswith("/"):
        base = ex["url"].rstrip("/") + base
    cap = ex.get("cap", WP_CAP)
    out, offset, seen = [], None, set()
    while len(out) < cap:
        url = f"{base}?format=json-pretty" + (f"&offset={offset}" if offset else "")
        try:
            data = json.loads(get(url))
        except urllib.error.HTTPError as e:
            if e.code in (400, 403, 404):
                break
            raise
        items = data.get("items", [])
        if not items:
            break
        for r in items:
            link = r.get("fullUrl", "")
            if link.startswith("/"):
                link = ex["url"].rstrip("/") + link
            if not link or link in seen:
                continue
            seen.add(link)
            ms = r.get("publishOn") or r.get("addedOn") or 0
            date = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(ms / 1000)) if ms else ""
            out.append({"title": r.get("title", ""), "link": link,
                        "date": date, "content": r.get("body", ""), "categories": []})
        print(f"  …offset {offset or 'start'} ({len(out)})")
        pag = data.get("pagination", {})
        if not pag.get("nextPage"):
            break
        offset = pag.get("nextPageOffset")
        if not offset:
            break
        time.sleep(0.3)
    return out[:cap]

def backfill_lsn(ex):
    """LS:N Global Daily Signals: split the (cookieless, metered-free) index page
    by its <h3> signal headers. Recent-only + accumulates across daily runs."""
    import os
    base = "https://www.lsnglobal.com"
    h = get(base + "/daily-signals").decode("utf-8", "replace")
    dm = _re.search(r"(\d{2})\.(\d{2})\.(\d{4})", h)
    date = f"{dm.group(3)}-{dm.group(2)}-{dm.group(1)}T08:00:00" if dm else ""
    links = {}
    for m in _re.finditer(r'href="(/daily-signals/article/\d+/([a-z0-9-]+))"', h):
        links[m.group(2)] = base + m.group(1)
    parts = _re.split(r"<h3[^>]*>(.*?)</h3>", h, flags=_re.S)
    STOP = ("markets", "communities", "micro trends", "big ideas", "viewpoints",
            "podcasts", "most recent", "previous daily")
    today, it = [], iter(parts[1:])
    for head, body in zip(it, it):
        title = _re.sub(r"\s+", " ", _re.sub(r"<[^>]+>", " ", head)).strip()
        low = title.lower()
        if low.startswith("by ") or len(title) < 8:
            continue
        if any(low.startswith(s) or low == s for s in STOP):
            break  # reached the sidebar / related lists
        if len(_re.sub(r"<[^>]+>", " ", body).strip()) < 80:
            continue
        slug = _re.sub(r"[^a-z0-9]+", "-", low).strip("-")
        link = next((u for s, u in links.items() if slug[:18] in s or s in slug), base + "/daily-signals")
        today.append({"title": title, "link": link, "date": date, "content": body, "categories": ["Daily Signals"]})
    fn = f"data/archive_{ex['id']}.jsonl"
    existing = [json.loads(l) for l in open(fn)] if os.path.exists(fn) else []
    merged = {}
    for it2 in existing + today:
        merged[(it2.get("date", "")[:10], it2.get("title", "")[:60])] = it2
    print(f"  +{len(today)} today, {len(merged)} total")
    return list(merged.values())

def backfill_reddit(ex):
    """Page the Arctic-Shift archive (a public Pushshift mirror, current through 2026) for a
    Reddit user's full self-post history — the .rss feed only carries ~25 recent items. Stores
    each post's body as lightly-cleaned markdown so links survive as [text](url) for the build."""
    import datetime, html as _h
    m = _re.search(r"/user/([^/]+)", ex.get("url", "") or "")
    author = m.group(1) if m else ex["id"]
    def clean_md(md):
        md = _h.unescape(md or "")
        md = _re.sub(r"(?m)^\s{0,3}#{1,6}\s+", "", md)        # headings
        md = _re.sub(r"\*\*(.+?)\*\*", r"\1", md)              # bold
        md = _re.sub(r"\*([^*\n]+)\*", r"\1", md)              # italic *…*
        md = _re.sub(r"(?<!\w)_([^_\n]+)_(?!\w)", r"\1", md)   # italic _…_
        md = _re.sub(r"(?m)^\s{0,3}>\s?", "", md)              # blockquote markers
        md = _re.sub(r"(?m)^\s{0,3}[-*]\s+", "• ", md)         # bullets
        md = _re.sub(r"(?m)^\s*[-*_]{3,}\s*$", "", md)         # horizontal rules
        return md.strip()
    out, before, seen = [], None, set()
    for page in range(15):   # fast (~1s/page); loop stops early when history is exhausted
        u = f"https://arctic-shift.photon-reddit.com/api/posts/search?author={author}&limit=100&sort=desc"
        if before:
            u += f"&before={before}"
        try:
            data = json.loads(get(u)).get("data", [])
        except Exception as e:
            print(f"  ! page {page+1}: {e}"); break
        if not data:
            break
        for p in data:
            cid = p.get("id")
            if not cid or cid in seen:
                continue
            seen.add(cid)
            body = p.get("selftext") or ""
            cu = p.get("created_utc")
            if len(body) < 200 or not cu:   # skip link-posts / removed / stubs
                continue
            out.append({
                "title": (p.get("title") or "").strip(),
                "link": "https://www.reddit.com" + (p.get("permalink") or ""),
                "date": datetime.datetime.fromtimestamp(int(cu), datetime.timezone.utc).isoformat(),
                "content": clean_md(body),
                "categories": [p.get("subreddit") or ""],
            })
        before = min(int(p["created_utc"]) for p in data if p.get("created_utc"))
        print(f"  page {page+1}: {len(data)} fetched, {len(out)} kept, before={before}")
        if len(data) < 100:
            break
        time.sleep(1)
    return out

def main():
    experts = json.load(open("experts.json"))
    want = sys.argv[1] if len(sys.argv) > 1 else None
    for ex in experts:
        bf = ex.get("backfill")
        if not bf or (want and ex["id"] != want):
            continue
        print(f"backfilling {ex['id']} ({bf})…")
        items = (backfill_substack(ex) if bf == "substack"
                 else backfill_wordpress(ex) if bf == "wordpress"
                 else backfill_wpcom(ex) if bf == "wpcom"
                 else backfill_protein(ex) if bf == "protein"
                 else backfill_lsn(ex) if bf == "lsn"
                 else backfill_reddit(ex) if bf == "reddit"
                 else backfill_squarespace(ex) if bf == "squarespace"
                 else [])
        out = f"data/archive_{ex['id']}.jsonl"
        with open(out, "w") as f:
            for it in items:
                f.write(json.dumps(it) + "\n")
        print(f"  {ex['id']}: {len(items)} -> {out}")

if __name__ == "__main__":
    main()

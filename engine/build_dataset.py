#!/usr/bin/env python3
"""Turn raw posts into a structured SIGNALS dataset + Radar aggregates.

Output (consumed by the web app):
  app/data/signals.jsonl  - one record per atom (signal)
  app/data/radar.json     - precomputed aggregates for the Radar view
"""
import json, re, collections, os
from urllib.parse import urlparse
from html import unescape

SRC = "data/posts_full.jsonl"
OUT_DIR = "../web/data"
os.makedirs(OUT_DIR, exist_ok=True)

# ---------- theme vocabulary (shared controlled vocab) ----------
THEMES = {
 "AI & machine learning": r"\b(artificial intelligence|machine learning|\bai\b|neural net|deep learning|large language model|\bllm|gpt|chatgpt|openai|anthropic|deepmind|generative ai)\b",
 "Platform power / Big Tech": r"\b(monopoly|antitrust|big tech|platform|gatekeeper|google|facebook|meta|amazon|apple|microsoft|enshittif)\b",
 "Democracy & disinformation": r"\b(democracy|disinformation|misinformation|propaganda|election|populism|fake news|polari[sz]ation|authoritarian|fascis|coup)\b",
 "Social media & attention": r"\b(social media|twitter|tiktok|instagram|attention economy|engagement|viral|influencer|doomscroll)\b",
 "Geopolitics & power": r"\b(china|russia|geopolit|sovereignty|ukraine|huawei|semiconductor|tariff|nato)\b",
 "Surveillance & privacy": r"\b(surveillance|privacy|facial recognition|tracking|data protection|gdpr|spyware|pegasus|snowden)\b",
 "Climate & environment": r"\b(climate|carbon|emission|warming|fossil fuel|renewable|sustainab|biodiversity)\b",
 "Crypto / web3": r"\b(bitcoin|crypto|blockchain|web3|ethereum|nft|stablecoin)\b",
 "Labour & automation": r"\b(automation|jobs|labour|gig economy|unemployment|future of work)\b",
 "Regulation & governance": r"\b(regulation|regulat|legislation|antitrust|policy|govern|ofcom)\b",
 "Economy & markets": r"\b(inflation|recession|markets?|economy|economic|bubble|capital|austerity|gdp|interest rate)\b",
 "Media & journalism": r"\b(journalism|newspaper|\bmedia\b|bbc|the observer|broadcast|publishing)\b",
}
THEME_RX = {k: re.compile(v, re.I) for k, v in THEMES.items()}

# ---------- section classification ----------
def classify(heading):
    h = heading.lower()
    if "quote of the day" in h: return "quote"
    if "musical" in h or "music" == h.strip(): return "music"
    if "long read" in h: return "longread"
    if "books" in h: return "book"
    if "commonplace" in h: return "commonplace"
    if "linkblog" in h or "link blog" in h: return "linkblog"
    if "chart of the day" in h: return "chart"
    if "feedback" in h: return "skip"   # drop reader feedback sections
    if "errata" in h or "this blog is also available" in h: return "skip"
    return "note"

# subscribe / newsletter CTAs to strip (they sit at the end of the content)
_CTA = [
    re.compile(r"\bt?his\s+blog\s+is\s+(?:now\s+)?also\s+available\b.*$", re.I | re.S),
    re.compile(r"\bif you.d (?:like|prefer) to (?:receive|get) this blog\b.*$", re.I | re.S),
    # "why not subscribe" appears only in his newsletter CTA — cut its whole sentence to the end
    re.compile(r"[^.?!]*\bwhy not subscribe\b.*$", re.I | re.S),
]

def _strip_cta(t):
    for rx in _CTA:
        t = rx.sub("", t).strip()
    return t

def clean(htmlfrag):
    """Plain inline text — for short fields (headings, link anchors)."""
    t = re.sub(r"<script.*?</script>", " ", htmlfrag, flags=re.S|re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = unescape(t)
    return re.sub(r"\s+", " ", t).strip()

_BLOCK_END = re.compile(r"</(?:p|div|li|ul|ol|blockquote|h[1-6]|tr|figure|figcaption|section|article)\s*>", re.I)
_BR = re.compile(r"<br\s*/?>", re.I)

def clean_block(htmlfrag):
    """Paragraph-preserving text — mirrors the original post's block structure."""
    t = re.sub(r"<script.*?</script>", " ", htmlfrag, flags=re.S|re.I)
    t = _BR.sub("\n", t)
    t = _BLOCK_END.sub("\n\n", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = unescape(t)
    t = re.sub(r"[ \t]+", " ", t)         # collapse spaces within a line
    t = re.sub(r" *\n *", "\n", t)         # trim around line breaks
    t = re.sub(r"\n{3,}", "\n\n", t)       # max one blank line between paras
    return _strip_cta(t.strip()).strip()

def links_of(htmlfrag):
    out = []
    for m in re.finditer(r'<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', htmlfrag, flags=re.S|re.I):
        url = m.group(1); anchor = clean(m.group(2))
        try: dom = urlparse(url).netloc.lower().replace("www.", "")
        except Exception: continue
        if not dom or "naughton" in dom: continue
        if any(dom.endswith(e) for e in (".jpg",".png",".gif")): continue
        if url.lower().endswith((".jpg",".jpeg",".png",".gif")): continue
        # drop subscribe / newsletter CTAs
        if "subscribe" in anchor.lower() or "subscribe" in url.lower(): continue
        if dom.endswith("follow.it") or "mailchi" in dom: continue
        out.append({"url": url, "domain": dom, "anchor": anchor[:160]})
    return out

def themes_of(text):
    return [t for t, rx in THEME_RX.items() if rx.search(text)]

_IMG = re.compile(r'<img\s[^>]*?src=["\']([^"\']+)["\']', re.I)
_IMG_SKIP = ("s.w.org", "gravatar", "/emoji/", "feed-icon", "smilies", "spacer.", "pixel.", "/avatar")
def images_of(htmlfrag):
    out = []
    for m in _IMG.finditer(htmlfrag):
        u = m.group(1).strip()
        low = u.lower()
        if low.startswith("data:") or low.endswith(".svg"): continue
        if any(x in low for x in _IMG_SKIP): continue
        if u.startswith("http://"): u = "https://" + u[7:]
        if u not in out: out.append(u)
        if len(out) >= 4: break
    return out

# ---------- build signals ----------
H2 = re.compile(r"<h2[^>]*>(.*?)</h2>", re.S|re.I)
STRONG = re.compile(r"<(?:strong|b)[^>]*>(.*?)</(?:strong|b)>", re.S|re.I)

def split_sections(html):
    parts = H2.split(html)
    # parts = [pre, head1, body1, head2, body2, ...]
    secs = []
    if len(parts) >= 3:
        it = iter(parts[1:])
        for head, body in zip(it, it):
            secs.append((clean(head), body))
    return secs

def dedup_title(title, txt):
    """Drop a leading repeat of the heading from the body text."""
    if title and txt.lower().startswith(title.lower()):
        return txt[len(title):].lstrip(" .,—–-:\n\t")
    return txt

def heading_title(section_type, body_html, fallback):
    m = STRONG.search(body_html)
    if m:
        t = clean(m.group(1))
        if t and "this blog is also available" not in t.lower() and len(t) > 3:
            return t[:200]
    return fallback

def _sig(sid, pid, date, source, source_id, st, heading, txt, imgs, links, url):
    return {
        "id": sid, "post_id": pid, "date": date, "year": int(date[:4]),
        "source": source, "source_id": source_id, "type": st, "heading": heading,
        "text": txt[:12000], "themes": themes_of(txt), "links": links[:8],
        "images": imgs, "post_url": url,
    }

# ---------- adapter: John Naughton (rich section format) ----------
def build_naughton(ex):
    rows = [json.loads(l) for l in open(SRC)]
    sigs = []
    for r in rows:
        pid = r["id"]; date = r["date"]; url = r["link"]
        html = r["content"]["rendered"]
        secs = split_sections(html)
        if not secs:
            txt = clean_block(html)
            if len(txt) < 40: continue
            heading = clean(r["title"]["rendered"]) or "Note"
            txt = dedup_title(heading, txt)
            sigs.append(_sig(f"{pid}-0", pid, date, ex["name"], ex["id"], "note", heading, txt, images_of(html), links_of(html), url))
            continue
        for i, (head, body) in enumerate(secs):
            st = classify(head)
            if st in ("skip", "music"): continue
            txt = clean_block(body); imgs = images_of(body)
            if i == 0 and st == "note" and ("<img" in body or len(txt) < 220): continue
            if st == "quote":
                if not txt: continue
            elif len(txt) < 25 and not imgs:
                continue
            title = head if st in ("quote","book","commonplace","linkblog","chart") else heading_title(st, body, head)
            txt = dedup_title(title, txt)
            sigs.append(_sig(f"{pid}-{i}", pid, date, ex["name"], ex["id"], st, title, txt, imgs, links_of(body), url))
    return sigs

# ---------- adapter: generic RSS/Substack (any author) ----------
def build_rss(ex):
    # merge deep archive (backfill) + recent RSS, archive first so it wins de-dupe
    items = []
    for fn in (f"data/archive_{ex['id']}.jsonl", f"data/raw_{ex['id']}.jsonl"):
        if os.path.exists(fn):
            items += [json.loads(l) for l in open(fn)]
    if not items:
        print(f"  ! {ex['id']}: no feed/archive file — skipping")
        return []
    seen = set(); uniq = []
    for it in items:
        key = (it.get("link", "") or "").rstrip("/") or it.get("title", "")
        if key in seen: continue
        seen.add(key); uniq.append(it)
    sigs = []
    for i, it in enumerate(uniq):
        html = it.get("content", "") or ""
        txt = clean_block(html)
        if len(txt) < 40: continue
        heading = clean(it.get("title", "")) or "Article"
        txt = dedup_title(heading, txt)
        date = it.get("date", "")
        if not (len(date) >= 4 and date[:4].isdigit()):
            continue  # skip items with an unparseable date
        sigs.append(_sig(f"{ex['id']}-{i}", f"{ex['id']}-{i}", date, ex["name"], ex["id"],
                         "article", heading, txt, images_of(html), links_of(html), it.get("link", "")))
    return sigs

# ---------- per-expert aggregates (replaces radar.json) ----------
def aggregate(ex, sigs):
    by_post = {}
    for s in sigs:
        p = by_post.setdefault(s["post_id"], {"year": s["year"], "themes": set()})
        p["themes"].update(s["themes"])
    years = sorted({s["year"] for s in sigs})
    posts_by_year = collections.Counter(p["year"] for p in by_post.values())
    traj = {}
    for t in THEMES:
        hits = collections.Counter()
        for p in by_post.values():
            if t in p["themes"]: hits[p["year"]] += 1
        traj[t] = {str(y): round(100 * hits[y] / max(1, posts_by_year[y]), 1) for y in years}
    maxy = max(years); miny = min(years)
    def momentum(t):
        ys = traj[t]
        rec = [ys[str(y)] for y in years if y >= maxy - 2] or [0]
        base = [ys[str(y)] for y in years if y <= maxy - 3]
        r = sum(rec) / len(rec)
        b = sum(base) / len(base) if base else r
        return round(r, 1), round(r - b, 1)
    themes_summary = []
    for t in THEMES:
        cur, delta = momentum(t)
        themes_summary.append({"theme": t, "current": cur, "delta": delta, "series": traj[t]})
    themes_summary.sort(key=lambda x: x["current"], reverse=True)
    def domains(yset):
        c = collections.Counter()
        for s in sigs:
            if s["year"] in yset:
                for l in s["links"]:
                    d = l["domain"]
                    if d in ("youtube.com","youtu.be","amzn.to","en.wikipedia.org"): continue
                    c[d] += 1
        return [{"domain": d, "n": n} for d, n in c.most_common(20)]
    return {
        "id": ex["id"], "name": ex["name"], "blurb": ex.get("blurb", ""), "url": ex.get("url", ""),
        "totals": {"posts": len(by_post), "signals": len(sigs),
                   "date_min": min(s["date"] for s in sigs)[:10],
                   "date_max": max(s["date"] for s in sigs)[:10]},
        "signal_types": dict(collections.Counter(s["type"] for s in sigs)),
        "themes": themes_summary, "years": [str(y) for y in years],
        "top_sources_recent": domains(set(range(maxy - 6, maxy + 1))),
        "top_sources_early": domains(set(range(miny, miny + 9))),
    }

# ---------- orchestrate all experts ----------
ADAPTERS = {"naughton": build_naughton, "rss": build_rss}
experts_cfg = json.load(open("experts.json"))
all_sigs = []
experts_out = []
for ex in experts_cfg:
    fn = ADAPTERS.get(ex.get("adapter"))
    sigs = fn(ex) if fn else []
    if not sigs:
        print(f"  {ex['id']}: 0 signals"); continue
    all_sigs += sigs
    experts_out.append(aggregate(ex, sigs))
    print(f"  {ex['id']}: {len(sigs)} signals ({experts_out[-1]['totals']['date_min']}..{experts_out[-1]['totals']['date_max']})")

with open(f"{OUT_DIR}/signals.jsonl", "w") as f:
    for s in all_sigs:
        f.write(json.dumps(s) + "\n")
json.dump(experts_out, open(f"{OUT_DIR}/experts.json", "w"), indent=1)

print(f"TOTAL: {len(all_sigs)} signals across {len(experts_out)} experts -> {OUT_DIR}/signals.jsonl + experts.json")

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
    if "feedback" in h: return "feedback"
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

rows = [json.loads(l) for l in open(SRC)]
signals = []
for r in rows:
    pid = r["id"]; date = r["date"]; url = r["link"]
    html = r["content"]["rendered"]
    secs = split_sections(html)
    if not secs:  # unstructured (older) post -> single note signal
        txt = clean_block(html)
        if len(txt) < 40: continue
        heading = clean(r["title"]["rendered"]) or "Note"
        txt = dedup_title(heading, txt)
        signals.append({
            "id": f"{pid}-0", "post_id": pid, "date": date, "year": int(date[:4]),
            "source": "John Naughton", "source_id": "naughton",
            "type": "note", "heading": heading,
            "text": txt[:12000], "themes": themes_of(txt), "links": links_of(html)[:8],
            "images": images_of(html), "post_url": url,
        })
        continue
    for i, (head, body) in enumerate(secs):
        st = classify(head)
        if st in ("skip", "music"): continue   # drop boilerplate + musical alternatives
        txt = clean_block(body)
        imgs = images_of(body)
        # drop the opening photo + caption block (image and/or short caption before any real section)
        if i == 0 and st == "note" and ("<img" in body or len(txt) < 220):
            continue
        if st == "quote":
            if not txt: continue
        elif len(txt) < 25 and not imgs:   # keep image-only sections (e.g. Chart of the Day)
            continue
        title = head if st in ("quote","book","commonplace","linkblog","chart","feedback") else heading_title(st, body, head)
        txt = dedup_title(title, txt)
        signals.append({
            "id": f"{pid}-{i}", "post_id": pid, "date": date, "year": int(date[:4]),
            "source": "John Naughton", "source_id": "naughton",
            "type": st, "heading": title,
            "text": txt[:12000], "themes": themes_of(txt), "links": links_of(body)[:8],
            "images": imgs, "post_url": url,
        })

with open(f"{OUT_DIR}/signals.jsonl", "w") as f:
    for s in signals:
        f.write(json.dumps(s) + "\n")

# ---------- radar aggregates ----------
years = sorted({s["year"] for s in signals})
post_years = collections.Counter(r["date"][:4] for r in rows)
# theme prevalence per year (% of posts touching theme)
post_text = {}
for r in rows:
    post_text[r["id"]] = (clean(r["title"]["rendered"]) + " " + clean(r["content"]["rendered"])).lower()
traj = {}
for t, rx in THEME_RX.items():
    by_year = collections.Counter()
    for r in rows:
        if rx.search(post_text[r["id"]]): by_year[int(r["date"][:4])] += 1
    traj[t] = {str(y): round(100*by_year[y]/max(1, post_years[str(y)]), 1) for y in years}

def recent_momentum(t):
    ys = traj[t]
    recent = sum(ys.get(str(y),0) for y in (2023,2024,2025,2026))/4
    base = sum(ys.get(str(y),0) for y in (2017,2018,2019,2020))/4
    return round(recent,1), round(recent-base,1)

themes_summary = []
for t in THEMES:
    cur, delta = recent_momentum(t)
    themes_summary.append({"theme": t, "current": cur, "delta": delta, "series": traj[t]})
themes_summary.sort(key=lambda x: x["current"], reverse=True)

def domains(yset):
    c = collections.Counter()
    for s in signals:
        if s["year"] in yset:
            for l in s["links"]:
                d = l["domain"]
                if d in ("youtube.com","youtu.be","amzn.to","en.wikipedia.org"): continue
                c[d]+=1
    return [{"domain": d, "n": n} for d, n in c.most_common(20)]

type_counts = collections.Counter(s["type"] for s in signals)

radar = {
    "generated_from": SRC,
    "totals": {"posts": len(rows), "signals": len(signals),
               "date_min": min(r["date"] for r in rows)[:10],
               "date_max": max(r["date"] for r in rows)[:10]},
    "signal_types": dict(type_counts),
    "themes": themes_summary,
    "years": [str(y) for y in years],
    "top_sources_recent": domains(set(range(2020,2027))),
    "top_sources_early": domains(set(range(2002,2011))),
}
json.dump(radar, open(f"{OUT_DIR}/radar.json","w"), indent=1)

print(f"signals: {len(signals)}  -> {OUT_DIR}/signals.jsonl")
print(f"signal types: {dict(type_counts)}")
print(f"posts: {len(rows)}  range {radar['totals']['date_min']}..{radar['totals']['date_max']}")
print("top themes now:", [(t['theme'], t['current']) for t in themes_summary[:4]])

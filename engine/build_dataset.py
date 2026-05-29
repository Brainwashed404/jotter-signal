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

def clean(htmlfrag):
    t = re.sub(r"<script.*?</script>", " ", htmlfrag, flags=re.S|re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = unescape(t)
    return re.sub(r"\s+", " ", t).strip()

def links_of(htmlfrag):
    out = []
    for m in re.finditer(r'<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', htmlfrag, flags=re.S|re.I):
        url = m.group(1); anchor = clean(m.group(2))
        try: dom = urlparse(url).netloc.lower().replace("www.", "")
        except Exception: continue
        if not dom or "naughton" in dom: continue
        if any(dom.endswith(e) for e in (".jpg",".png",".gif")): continue
        if url.lower().endswith((".jpg",".jpeg",".png",".gif")): continue
        out.append({"url": url, "domain": dom, "anchor": anchor[:160]})
    return out

def themes_of(text):
    return [t for t, rx in THEME_RX.items() if rx.search(text)]

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
        txt = clean(html)
        if len(txt) < 40: continue
        signals.append({
            "id": f"{pid}-0", "post_id": pid, "date": date, "year": int(date[:4]),
            "source": "John Naughton", "source_id": "naughton",
            "type": "note", "heading": clean(r["title"]["rendered"]) or "Note",
            "text": txt[:2000], "themes": themes_of(txt), "links": links_of(html)[:8],
            "post_url": url,
        })
        continue
    for i, (head, body) in enumerate(secs):
        st = classify(head)
        if st in ("skip",): continue
        txt = clean(body)
        if st == "quote":
            if not txt: continue
        elif len(txt) < 25:   # drop near-empty (e.g. photo captions)
            continue
        if i == 0 and st == "note" and len(txt) < 120:
            continue  # opening photo caption
        title = head if st in ("quote","music","book","commonplace","linkblog","chart","feedback") else heading_title(st, body, head)
        signals.append({
            "id": f"{pid}-{i}", "post_id": pid, "date": date, "year": int(date[:4]),
            "source": "John Naughton", "source_id": "naughton",
            "type": st, "heading": title,
            "text": txt[:2000], "themes": themes_of(txt), "links": links_of(body)[:8],
            "post_url": url,
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

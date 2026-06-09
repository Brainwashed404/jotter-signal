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
    if "quote of the day" in h: return "skip"   # drop Naughton's "Quote of the Day" (keep all his other sections)
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
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", htmlfrag, flags=re.S|re.I)
    t = re.sub(r"<[^>]+>", " ", t)
    t = unescape(t)
    return re.sub(r"\s+", " ", t).strip()

_BLOCK_END = re.compile(r"</(?:p|div|li|ul|ol|blockquote|h[1-6]|tr|figure|figcaption|section|article)\s*>", re.I)
_BR = re.compile(r"<br\s*/?>", re.I)
_A = re.compile(r'<a\s[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', re.S | re.I)

def _md_links(t):
    """Convert <a href> into markdown [text](url) so inline links survive cleaning."""
    def repl(m):
        url = m.group(1).strip()
        inner = re.sub(r"<[^>]+>", "", m.group(2)).strip()
        low = url.lower()
        if not low.startswith(("http://", "https://")):
            return inner
        if low.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
            return inner
        if not inner:
            inner = urlparse(url).netloc.replace("www.", "")
        inner = inner.replace("[", "").replace("]", "")
        return f"[{inner}]({url})"
    return _A.sub(repl, t)

def clean_block(htmlfrag):
    """Paragraph-preserving text — mirrors the original post's block structure."""
    t = re.sub(r"<(script|style)\b.*?</\1>", " ", htmlfrag, flags=re.S|re.I)
    # Drop <iframe> embeds (e.g. Instagram). Their srcdoc="…" holds a whole escaped
    # HTML doc with literal '>' chars, which would break the generic <[^>]+> stripper
    # below and leak the embed markup as text — so match the tag respecting quotes.
    t = re.sub(r"""<iframe\b(?:[^>"']|"[^"]*"|'[^']*')*>""", " ", t, flags=re.S|re.I)
    t = _md_links(t)
    t = _BR.sub("\n", t)
    t = _BLOCK_END.sub("\n\n", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = unescape(t)
    t = re.sub(r"[ \t]+", " ", t)         # collapse spaces within a line
    t = re.sub(r" *\n *", "\n", t)         # trim around line breaks
    t = re.sub(r"\n{3,}", "\n\n", t)       # max one blank line between paras
    return _strip_cta(t.strip()).strip()

def _extract_div(html, class_substr):
    """Return the inner HTML of the first <div> whose class contains class_substr,
    matched by walking nested <div>/</div> depth (regex can't balance tags)."""
    m = re.search(r'<div\b[^>]*class="[^"]*' + re.escape(class_substr) + r'[^"]*"[^>]*>', html, re.I)
    if not m:
        return None
    start = m.end(); depth = 1
    for t in re.finditer(r"</?div\b", html[start:], re.I):
        depth += -1 if html[start + t.start():start + t.start() + 2].lower() == "</" else 1
        if depth == 0:
            return html[start:start + t.start()]
    return html[start:]   # unbalanced markup — take the remainder

def extract_substack_body(html):
    """Substack full-page scrapes wrap the article in <div class="available-content">
    → <div class="body markup">. Everything outside it is chrome: the post header
    (title/subtitle/byline + the 'Post UFI' like/comment/share bar) and the footer
    (subscribe widgets, comments, recommendations). Isolate the body so none of that
    chrome leaks into the signal. Clean RSS items (no such div) pass through unchanged."""
    inner = _extract_div(html, "body markup") or _extract_div(html, "available-content")
    return inner if inner is not None else html

# Lone image-credit caption lines (Substack hero images), e.g. "Photo by X on Unsplash".
_IMG_CREDIT = re.compile(r"^\s*(?:photo|image|illustration|credit|source)\b.{0,80}?\b(?:unsplash|getty|reuters|shutterstock|flickr|wikimedia|via)\b.*$", re.I)
def strip_image_credits(txt):
    keep = [l for l in txt.split("\n") if not _IMG_CREDIT.match(_demd(l.strip()))]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(keep)).strip()

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
# Pluralistic uses <h1> sections (not h1 class="toch1" which is the TOC header)
H1_DOC = re.compile(r"<h1(?!\s[^>]*class=\"toch1\")[^>]*>(.*?)</h1>", re.S|re.I)
_DOC_SKIP = re.compile(
    r"^(upcoming|recent)\s+appearances\b|^(latest|upcoming)\s+books\b|^colophon\b"
    r"|^today.s\s+links\b|^how\s+to\s+get\s+pluralistic\b",
    re.I
)
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

_CRUFT = re.compile(
    r"^(seeds|email|copy link|share this.*|share on .+|\d+\s*min read|"
    r"[A-Z][a-z]+ \d{1,2},? \d{4})$", re.I)
def _demd(s):
    """markdown link [text](url) -> text, for pattern matching."""
    return re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s).strip()

def strip_feed_cruft(txt):
    """Remove scraped article chrome: share buttons, read-time, date, repeated title."""
    out = []
    last_nonblank = None
    for l in txt.split("\n"):
        s = l.strip()
        plain = _demd(s)
        if plain and _CRUFT.match(plain):
            continue
        if s and s == last_nonblank:   # drop repeated line (e.g. title printed twice)
            continue
        if s:
            last_nonblank = s
        out.append(l)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()

_EV_ISSUE = re.compile(r"exponential view\s+#\d+", re.I)
_EV_TESTIMONIAL = re.compile(r"paying member|a member of exponential view", re.I)

def strip_exponentialview(txt):
    """Remove Exponential View / Substack post chrome: the author byline, the
    '∙ Paid' badge, the like/comment/share counts, the 'Share' button, and
    subscriber testimonials."""
    out = []
    for para in re.split(r"\n{2,}", txt):
        p = para.strip()
        if not p:
            continue
        plain = _demd(p)
        low = plain.lower()
        if _EV_TESTIMONIAL.search(p):
            continue
        if "substack.com/@" in p and len(plain) < 90:   # author byline (links)
            continue
        if re.fullmatch(r"[∙·•・]?\s*paid", low):          # "∙ Paid" badge
            continue
        if re.fullmatch(r"\d[\d,]*", plain):              # like / comment / share counts
            continue
        if low in ("share", "comment", "comments", "subscribe", "subscribe now"):
            continue
        out.append(p)
    return re.sub(r"\n{3,}", "\n\n", "\n\n".join(out)).strip()

def strip_reddit(txt):
    """Strip Reddit RSS chrome: the reddit.com self-link, 'submitted by /u/…', and
    the trailing [link]/[comments] markers — leaving any real self-post body."""
    txt = re.sub(r"\[reddit\.com\]\([^)]*\)", "", txt)
    txt = re.sub(r"submitted by \[/u/[^\]]+\]\([^)]*\)", "", txt, flags=re.I)
    txt = re.sub(r"\[(?:link|comments)\]\([^)]*\)", "", txt, flags=re.I)
    return re.sub(r"\n{3,}", "\n\n", txt).strip()

_EMAIL_CRUFT = re.compile(
    r"^\s*(view (this )?(email|newsletter) (in|on) (your )?(browser|the web)|"
    r"unsubscribe|update (your )?preferences|manage (your )?subscription|"
    r"you('re| are) receiving this|sent to\b|copyright ©|©\s*\d{4}|"
    r"powered by\b|add us to your address book|forward (this )?to a friend|"
    r"having trouble (reading|viewing))\b.*$", re.I)
def strip_email_cruft(txt):
    """Drop the standard email chrome: view-in-browser, unsubscribe, preferences,
    copyright/address footers — the lines every newsletter platform injects."""
    lines = [l for l in txt.split("\n") if not _EMAIL_CRUFT.match(l.strip())]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()

def strip_digitalnative(txt):
    """Remove Digital Native's recurring masthead/subscribe block at the top of each post.

    The block looks like:
      Weekly writing exploring how technology and humanity collide. If you haven't
      subscribed, join 40,000 weekly readers by subscribing here:

      [Subscribe now](https://www.digitalnative.tech/subscribe?)

    The subscriber count has varied over time (40k, 70k, 100k …) so we match
    structurally rather than by exact number.
    """
    lines = txt.split("\n")
    cutoff = None
    for i, l in enumerate(lines[:25]):
        plain = _demd(l.strip()).lower()
        # Match any variant of the masthead / subscribe line
        if (("weekly writing" in plain and "technology" in plain) or
                re.search(r"join \d[\d,]+\+? weekly readers", plain) or
                ("haven" in plain and "subscribed" in plain) or
                ("subscribe now" in plain and i < 12)):
            cutoff = i
    if cutoff is not None:
        # Skip the cutoff line and any blank lines immediately after it
        start = cutoff + 1
        while start < len(lines) and not lines[start].strip():
            start += 1
        lines = lines[start:]
    return re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()

def strip_pluralistic(txt):
    """Remove Pluralistic's recurring template (masthead, section index, trailing
    appearances/books/colophon/permalink)."""
    out = []
    for l in txt.split("\n"):
        s = l.strip()
        low = _demd(s).lower()
        if re.match(r"^(upcoming|recent) appearances\b", low):
            break  # everything from here down is boilerplate
        if re.match(r"^[->\s]{3,}$", s):
            continue
        if low in ("top sources:", "none", "-->", "<!--", "today's links", "today’s links"):
            continue
        if re.match(r"^(hey look at this|object permanence|colophon)\b", low):
            continue
        if re.search(r"\(\s*permalink\s*\)\s*$", low):
            continue
        out.append(l)
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()

def heading_title(section_type, body_html, fallback):
    m = STRONG.search(body_html)
    if m:
        t = clean(m.group(1))
        if t and "this blog is also available" not in t.lower() and len(t) > 3:
            return t[:200]
    return fallback

_STAT_RE = re.compile(r"\d+\.?\d*\s*%|\$\d[\d,]*|\£\d[\d,]*|\d+x\b|per cent\b", re.I)

# Interview / Q&A / transcript detection: lines beginning with a "Speaker:" label,
# where two speakers dominate and take sustained turns (a real back-and-forth, not
# a one-off "Note:" header). Catches podcast transcripts and interview pieces so they
# can be filtered separately in the Feed.
_QA_LABEL = re.compile(r"^[*_>\s]{0,3}([A-Z][A-Za-z.'\- ]{1,28}?):\s", re.M)

# Generic template section-headers that repeat like speakers but AREN'T (a recurring
# "**Book:** ... **Why:** ..." roundup template, not an interview). If the two dominant
# labels are these, it's a list/roundup, not a Q&A.
_QA_STOPLABELS = {
    "book", "why", "note", "update", "edit", "source", "image", "photo", "caption",
    "title", "summary", "background", "context", "details", "example", "tip", "warning",
    "quote", "ps", "nb", "also", "plus", "bonus", "read", "link", "links", "more",
    "related", "what", "key", "the news", "the gist", "takeaway", "recommendation",
}

def _looks_like_list(txt, n_links):
    """A repeating section-label template (Book:/Why: ...) with several links = a roundup/list."""
    labels = [l.strip().lower() for l in _QA_LABEL.findall(txt)]
    if not labels:
        return False
    return n_links >= 4 and collections.Counter(labels).most_common(1)[0][1] >= 4

def is_qanda(txt):
    labels = [l.strip() for l in _QA_LABEL.findall(txt)]
    if len(labels) < 8:
        return False
    common = collections.Counter(labels).most_common(2)
    if len(common) < 2:
        return False
    (s1, n1), (s2, n2) = common
    # Both top speakers take >= 4 turns AND the two of them account for most labels.
    if not (n1 >= 4 and n2 >= 4 and (n1 + n2) / len(labels) >= 0.6):
        return False
    # Reject template roundups: if either dominant label is a generic section header
    # (Book:/Why:/Note: ...) it's a list, not a real two-person interview.
    if s1.lower() in _QA_STOPLABELS or s2.lower() in _QA_STOPLABELS:
        return False
    return True

def kind_of(txt, signal_type, n_links):
    """Universal content kind for cross-expert filtering."""
    # Map from Naughton-specific types
    if signal_type == "longread":              return "longread"
    if signal_type in ("quote", "commonplace"): return "quote"
    if signal_type in ("linkblog", "book"):     return "links"
    if signal_type == "chart":                  return "data"
    # Interview / Q&A / transcript (overrides the length heuristics below)
    if is_qanda(txt):                            return "qanda"
    tlen = len(txt)
    # Quote: short + looks like quoted text
    if tlen < 1000 and (txt.lstrip().startswith(">") or txt.count("“") + txt.count('"') >= 2):
        return "quote"
    # Data: ONLY genuinely stats-DENSE short pieces, not a long essay that merely mentions
    # a few numbers. (Naughton charts already map to "data" via signal_type above.) Requires
    # both a high absolute count AND high density (stats per 1000 chars).
    stats = len(_STAT_RE.findall(txt))
    if stats >= 5 and tlen < 1800 and stats / max(tlen, 1) * 1000 >= 3:
        return "data"
    # Links roundup. Three ways to qualify:
    #   (a) short-form: a sentence or two wrapped around a link;
    #   (b) link-dense: several links with little prose between them (headline + URL, repeated);
    #   (c) a templated list (e.g. **Book:** … **Why:** …) with several links.
    # A full article that merely contains a few links does NOT qualify (low link density).
    if (tlen < 500 and n_links >= 1) \
       or (n_links >= 3 and tlen / max(n_links, 1) < 380) \
       or _looks_like_list(txt, n_links):
        return "links"
    # Long read: a genuinely long essay (~1000+ words), not a medium article. Threshold
    # raised from 2500 → 6000 chars so ordinary articles stay "article".
    if tlen > 6000:
        return "longread"
    return "article"

def _sig(sid, pid, date, source, source_id, st, heading, txt, imgs, links, url):
    t = txt[:12000]
    return {
        "id": sid, "post_id": pid, "date": date, "year": int(date[:4]),
        "source": source, "source_id": source_id, "type": st,
        "kind": kind_of(t, st, len(links)),
        "heading": heading, "text": t, "themes": themes_of(t),
        "links": links[:8], "images": imgs, "post_url": url,
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
            if classify(heading) in ("skip", "music"): continue   # whole-post "Quote of the Day" etc.
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

# ---------- adapter: Cory Doctorow / Pluralistic (H1-section format) ----------
def build_doctorow(ex):
    items = []
    for fn in (f"data/archive_{ex['id']}.jsonl", f"data/raw_{ex['id']}.jsonl"):
        if os.path.exists(fn):
            items += [json.loads(l) for l in open(fn)]
    seen = set(); uniq = []
    for it in items:
        key = (it.get("link", "") or "").rstrip("/") or it.get("title", "")
        if key in seen: continue
        seen.add(key); uniq.append(it)
    sigs = []
    for it in uniq:
        html = it.get("content", "") or ""
        date = it.get("date", "")
        if not (len(date) >= 4 and date[:4].isdigit()):
            continue
        url = it.get("link", "")
        pid = url.rstrip("/").split("/")[-1] or it.get("title", "")[:40]
        parts = H1_DOC.split(html)
        if len(parts) < 3:
            # no H1 sections — treat as a plain article
            txt = strip_feed_cruft(clean_block(html))
            if len(txt) >= 40:
                heading = clean(it.get("title", "")) or "Article"
                sigs.append(_sig(f"doctorow-{pid}-0", pid, date, ex["name"], ex["id"],
                                 "article", heading, dedup_title(heading, txt),
                                 images_of(html), links_of(html), url))
            continue
        it2 = iter(parts[1:])
        for i, (head_html, body) in enumerate(zip(it2, it2)):
            head = re.sub(r"\s*\(\s*permalink\s*\)\s*$", "", clean(head_html), flags=re.I).strip()
            if not head or _DOC_SKIP.match(_demd(head).lower()):
                continue
            txt = strip_feed_cruft(clean_block(body))
            if len(txt) < 40:
                continue
            txt = dedup_title(head, txt)
            sigs.append(_sig(f"doctorow-{pid}-{i}", pid, date, ex["name"], ex["id"],
                             "article", head, txt, images_of(body), links_of(body), url))
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
    # optional feed-vertical filter (e.g. Semafor -> Technology only). NB: this is the
    # RSS section filter, NOT the author/publication `category` field (different concept).
    catwant = (ex.get("vertical") or "").lower()
    if catwant:
        items = [it for it in items if any(catwant in (c or "").lower() for c in it.get("categories", []))]
    seen = set(); uniq = []
    for it in items:
        key = (it.get("link", "") or "").rstrip("/") or it.get("title", "")
        if key in seen: continue
        seen.add(key); uniq.append(it)
    sigs = []
    reddit_titles = set()   # collapse crossposts/repost-attempts that share a title
    for i, it in enumerate(uniq):
        heading = clean(it.get("title", "")) or "Article"
        if ex["id"] == "exponentialview" and re.match(r"\s*live with\b", heading, re.I):
            continue  # drop "Live with …" event/video recordings (low text value)
        html = it.get("content", "") or ""
        if ex.get("backfill") == "substack":
            html = extract_substack_body(html)   # drop post-header/UFI/footer chrome
        txt = strip_feed_cruft(clean_block(html))
        if ex.get("backfill") == "substack":
            txt = strip_image_credits(txt)       # drop hero-image "Photo by … on Unsplash" captions
        links = links_of(html)
        if ex["id"] == "digitalnative":
            txt = strip_digitalnative(txt)
        if ex["id"] == "exponentialview":
            txt = strip_exponentialview(txt)
        if ex.get("source_kind") == "newsletter":
            txt = strip_email_cruft(txt)
        is_reddit = "reddit.com" in ((ex.get("feed") or "") + (ex.get("url") or ""))
        if is_reddit:
            txt = strip_reddit(txt)
            links = [l for l in links if l.get("domain") != "reddit.com"]  # drop self/user/comments links
            if not ex.get("link_aggregator"):
                # self-post source (e.g. Last Week in Collapse): the body IS the signal, so drop
                # removed/deleted/empty posts and the author's repeated repost attempts.
                body = _demd(txt).strip()
                if len(body) < 120 or re.match(r"^\[(removed|deleted)\]", body, re.I):
                    continue
                if heading in reddit_titles:
                    continue
                reddit_titles.add(heading)
        # Reddit link-posts have little/no body — the headline is the signal, so don't drop them.
        if len(txt) < 40 and not is_reddit: continue
        txt = dedup_title(heading, txt)
        date = it.get("date", "")
        if not (len(date) >= 4 and date[:4].isdigit()):
            continue  # skip items with an unparseable date
        sigs.append(_sig(f"{ex['id']}-{i}", f"{ex['id']}-{i}", date, ex["name"], ex["id"],
                         "article", heading, txt, images_of(html), links, it.get("link", "")))
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
        "signal_kinds": dict(collections.Counter(s["kind"] for s in sigs)),
        "themes": themes_summary, "years": [str(y) for y in years],
        "top_sources_recent": domains(set(range(maxy - 6, maxy + 1))),
        "top_sources_early": domains(set(range(miny, miny + 9))),
        "category": ex.get("category", "author"),  # "author" | "publication" (Experts vs Publications pages)
    }

# ---------- orchestrate all experts ----------
ADAPTERS = {"naughton": build_naughton, "doctorow": build_doctorow, "rss": build_rss}
experts_cfg = json.load(open("experts.json"))
# Auto-discovered newsletter sources (one per email sender) live in a separate
# manifest written by fetch_newsletters.py, so curated experts.json stays clean.
if os.path.exists("data/newsletters.json"):
    try:
        experts_cfg += list(json.load(open("data/newsletters.json")).values())
    except Exception as e:
        print(f"  ! newsletters.json load failed: {e}")
all_sigs = []
experts_out = []
for ex in experts_cfg:
    fn = ADAPTERS.get(ex.get("adapter"))
    sigs = fn(ex) if fn else []
    if not sigs:
        print(f"  {ex['id']}: 0 signals"); continue
    cat = ex.get("category", "author")   # stamp author|publication so cards can hide author blog names
    for s in sigs:
        s["category"] = cat
    all_sigs += sigs
    experts_out.append(aggregate(ex, sigs))
    print(f"  {ex['id']}: {len(sigs)} signals ({experts_out[-1]['totals']['date_min']}..{experts_out[-1]['totals']['date_max']})")

with open(f"{OUT_DIR}/signals.jsonl", "w") as f:
    for s in all_sigs:
        f.write(json.dumps(s) + "\n")
json.dump(experts_out, open(f"{OUT_DIR}/experts.json", "w"), indent=1)

print(f"TOTAL: {len(all_sigs)} signals across {len(experts_out)} experts -> {OUT_DIR}/signals.jsonl + experts.json")

#!/usr/bin/env python3
"""Ingest newsletters from a dedicated Gmail mailbox via IMAP.

The user subscribes newsletters with one dedicated Gmail account; this reads that
mailbox (read-only) and turns each into a source. Sender -> source mapping is
controlled by newsletter_map.json (group several senders into one publication,
set Experts vs Publications, ignore system senders). Senders that match nothing
get one source each (category publication).

Credentials (env): GMAIL_USER, GMAIL_APP_PASSWORD (a Google "app password").
Optional: GMAIL_FOLDER (default "INBOX").

Junk filter: welcome / confirmation / "please confirm" / security / sign-in mails
are dropped — they're onboarding noise, not content.

Incremental: tracks the highest IMAP UID per folder in newsletters_state.json.
Bump SCHEMA_V to force a one-time clean re-ingest (wipes nl-* raw + manifest).
Everything lives under data/ so it persists in the engine-data archive.

Usage: python3 fetch_newsletters.py
"""
import email, glob, imaplib, json, os, re
from email.utils import parseaddr, parsedate_to_datetime

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
STATE = os.path.join(DATA, "newsletters_state.json")
MANIFEST = os.path.join(DATA, "newsletters.json")
MAP = os.path.join(HERE, "newsletter_map.json")

SCHEMA_V = 4  # bump to force a clean re-ingest (e.g. after changing grouping logic); v4 drops Benedict Evans (now ignored)

# Onboarding / transactional mail that is never real content.
JUNK_SUBJECT = re.compile(
    r"(please confirm|confirm your (email|subscription|address)|"
    r"welcome to\b|thanks? for subscribing|thank you for (subscribing|signing up)|"
    r"verify your|security alert|new sign-?in|signed in|app password|"
    r"password (was|has been)|reset your password|complete your (sign|subscription)|"
    r"finish (setting|subscribing)|double opt|confirm now)", re.I)


def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")
    return s or "unknown"


def decode_part(part):
    raw = part.get_payload(decode=True) or b""
    cs = part.get_content_charset() or "utf-8"
    try:
        return raw.decode(cs, errors="replace")
    except (LookupError, TypeError):
        return raw.decode("utf-8", errors="replace")


def get_body(msg):
    html = text = None
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_disposition() == "attachment":
                continue
            ct = part.get_content_type()
            if ct == "text/html" and html is None:
                html = decode_part(part)
            elif ct == "text/plain" and text is None:
                text = decode_part(part)
    else:
        payload = decode_part(msg)
        if msg.get_content_type() == "text/html":
            html = payload
        else:
            text = payload
    if html:
        return html
    if text:
        return "<pre>" + text + "</pre>"
    return ""


_VIEW_RE = re.compile(r'<a[^>]+href="([^"]+)"[^>]*>(?:[^<]*?(?:view|read)[^<]*?(?:browser|online|web)[^<]*?)</a>', re.I)


def view_in_browser(html):
    m = _VIEW_RE.search(html or "")
    return m.group(1).strip() if m else ""


def decode_header(raw):
    if not raw:
        return ""
    try:
        out = []
        for txt, enc in email.header.decode_header(raw):
            out.append(txt.decode(enc or "utf-8", errors="replace") if isinstance(txt, bytes) else txt)
        return "".join(out).strip()
    except Exception:
        return str(raw).strip()


def load_json(path, default):
    if os.path.exists(path):
        try:
            return json.load(open(path))
        except Exception:
            pass
    return default


def classify(name, domain, groups):
    """Map a sender to (source_id, display_name, category) via newsletter_map.json."""
    nlow, dlow = (name or "").lower(), (domain or "").lower()
    for g in groups:
        md, mn = (g.get("match_domain") or "").lower(), (g.get("match_name") or "").lower()
        if (md and md in dlow) or (mn and mn in nlow):
            return g["id"], g.get("name", name), g.get("category", "publication")
    return "nl-" + slug(name), name, "publication"  # default: one source per sender


def main():
    user = os.environ.get("GMAIL_USER")
    pw = os.environ.get("GMAIL_APP_PASSWORD")
    folder = os.environ.get("GMAIL_FOLDER", "INBOX")
    if not user or not pw:
        print("[newsletters] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping")
        return
    os.makedirs(DATA, exist_ok=True)

    state = load_json(STATE, {})
    # One-time clean re-ingest when the schema changes (re-groups + re-filters everything).
    if state.get("_v") != SCHEMA_V:
        print(f"[newsletters] schema v{state.get('_v')} -> v{SCHEMA_V}: clean re-ingest")
        for f in glob.glob(os.path.join(DATA, "raw_nl-*.jsonl")):
            os.remove(f)
        if os.path.exists(MANIFEST):
            os.remove(MANIFEST)
        state = {"_v": SCHEMA_V}

    manifest = load_json(MANIFEST, {})
    mp = load_json(MAP, {})
    groups = mp.get("groups", [])
    ignore_domains = {d.lower() for d in mp.get("ignore_domains", [])}
    ignore_names = {n.lower() for n in mp.get("ignore_names", [])}

    print(f"[newsletters] connecting as {user} (folder {folder})")
    imap = imaplib.IMAP4_SSL("imap.gmail.com")
    imap.login(user, pw)
    imap.select(f'"{folder}"', readonly=True)

    typ, vdata = imap.status(f'"{folder}"', "(UIDVALIDITY)")
    m = re.search(rb"UIDVALIDITY (\d+)", vdata[0] or b"")
    uidvalidity = m.group(1).decode() if m else "0"
    fkey = f"{folder}:{uidvalidity}"
    last_uid = int(state.get(fkey, 0))

    typ, data = imap.uid("search", None, "ALL")
    all_uids = [int(u) for u in (data[0] or b"").split()]
    new_uids = [u for u in all_uids if u > last_uid]
    print(f"[newsletters] {len(all_uids)} messages, {len(new_uids)} new since UID {last_uid}")

    by_source = {}    # id -> list of items
    meta = {}         # id -> (display_name, category)
    dropped = 0
    for u in new_uids:
        typ, mdata = imap.uid("fetch", str(u), "(RFC822)")
        if typ != "OK" or not mdata or not mdata[0]:
            continue
        msg = email.message_from_bytes(mdata[0][1])
        name, addr = parseaddr(msg.get("From", ""))
        name = decode_header(name) or (addr.split("@")[0] if "@" in addr else "Unknown")
        domain = addr.split("@")[-1].lower() if "@" in addr else ""
        if domain in ignore_domains or any(n in name.lower() for n in ignore_names):
            continue
        subject = decode_header(msg.get("Subject", "")) or "(no subject)"
        if JUNK_SUBJECT.search(subject):
            dropped += 1
            continue
        try:
            date = parsedate_to_datetime(msg.get("Date", "")).isoformat()
        except Exception:
            date = ""
        if not date:
            continue
        sid, disp, category = classify(name, domain, groups)
        html = get_body(msg)
        mid = (msg.get("Message-ID") or f"uid-{uidvalidity}-{u}").strip("<> \t")
        link = view_in_browser(html) or f"mid:{mid}"
        by_source.setdefault(sid, []).append({
            "title": subject, "link": link, "date": date,
            "content": html, "categories": [], "message_id": mid,
        })
        meta[sid] = (disp, category)

    imap.logout()

    written = 0
    for sid, items in by_source.items():
        out = os.path.join(DATA, f"raw_{sid}.jsonl")
        existing = [json.loads(l) for l in open(out)] if os.path.exists(out) else []
        seen = {it.get("message_id") or it.get("link") for it in existing}
        merged = list(existing)
        for it in items:
            k = it.get("message_id") or it.get("link")
            if k not in seen:
                seen.add(k)
                merged.append(it)
        merged.sort(key=lambda it: it.get("date", ""), reverse=True)
        with open(out, "w") as f:
            for it in merged:
                f.write(json.dumps(it) + "\n")
        written += len(items)
        disp, category = meta[sid]
        prev = manifest.get(sid, {})
        manifest[sid] = {
            "id": sid, "name": prev.get("name") or disp,
            "blurb": prev.get("blurb") or "Newsletter (ingested via email).",
            "url": prev.get("url", ""), "adapter": "rss",
            "category": category, "source_kind": "newsletter",
        }

    if new_uids:
        state[fkey] = max(new_uids)
    json.dump(state, open(STATE, "w"), indent=1)
    json.dump(manifest, open(MANIFEST, "w"), indent=1, ensure_ascii=False)
    print(f"[newsletters] +{written} items across {len(by_source)} source(s); "
          f"{dropped} junk dropped; {len(manifest)} sources total")


if __name__ == "__main__":
    main()

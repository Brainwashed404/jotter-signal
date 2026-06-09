#!/usr/bin/env python3
"""Ingest newsletters from a dedicated Gmail mailbox via IMAP.

The user subscribes newsletters with one dedicated Gmail account; this reads that
mailbox (read-only), groups messages by sender, and writes one raw_<id>.jsonl per
sender plus a newsletters.json manifest. build_dataset then treats each sender as a
normal `rss` source (one source profile per newsletter sender).

Credentials (env): GMAIL_USER, GMAIL_APP_PASSWORD (a Google "app password", not the
account password). Optional: GMAIL_FOLDER (default "INBOX").

Incremental: tracks the highest IMAP UID seen per folder in data/newsletters_state.json,
so the first run pulls the whole back-catalogue and later runs only fetch new mail.
Everything lives under data/ so it persists in the engine-data archive between CI runs.

Usage: python3 fetch_newsletters.py
"""
import email, imaplib, json, os, re, sys
from email.utils import parseaddr, parsedate_to_datetime

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
STATE = os.path.join(DATA, "newsletters_state.json")
MANIFEST = os.path.join(DATA, "newsletters.json")

# sender addresses that are generic relays — don't use them to build a homepage URL
RELAY_DOMAINS = {"substack.com", "mail.beehiiv.com", "beehiiv.com", "mailchimpapp.net",
                 "mailchi.mp", "ghost.io", "convertkit-mail.com", "convertkit-mail2.com",
                 "kill-the-newsletter.com", "list-manage.com", "sendgrid.net"}

# Senders already covered by a curated source — skip so they don't get a duplicate
# tile. Ben Evans' newsletter flows into the curated `benedictevans` source via the
# email->RSS bridge, alongside his essays. Keys are computed source ids ("nl-"+slug).
IGNORE_SLUGS = {"nl-benedict-evans", "nl-benedicts-newsletter", "nl-ben-evans"}

# Transactional / system senders that aren't newsletters — never make a source.
SKIP_SENDER_RE = re.compile(
    r"(no-?reply|do-?not-?reply|mailer-daemon|postmaster|notifications?@|"
    r"@(accounts\.|mail\.)?google\.com|forwarding-noreply@)", re.I)

# One-time cleanup of source ids created before the filters above existed.
PURGE_SLUGS = {"nl-google"}


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
    """Prefer the HTML part; fall back to wrapping the plain-text part."""
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
        parts = email.header.decode_header(raw)
        out = []
        for txt, enc in parts:
            if isinstance(txt, bytes):
                out.append(txt.decode(enc or "utf-8", errors="replace"))
            else:
                out.append(txt)
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


def main():
    user = os.environ.get("GMAIL_USER")
    pw = os.environ.get("GMAIL_APP_PASSWORD")
    folder = os.environ.get("GMAIL_FOLDER", "INBOX")
    if not user or not pw:
        print("[newsletters] GMAIL_USER / GMAIL_APP_PASSWORD not set — skipping")
        return
    os.makedirs(DATA, exist_ok=True)

    state = load_json(STATE, {})
    manifest = load_json(MANIFEST, {})

    print(f"[newsletters] connecting as {user} (folder {folder})")
    imap = imaplib.IMAP4_SSL("imap.gmail.com")
    imap.login(user, pw)
    imap.select(f'"{folder}"', readonly=True)

    # Reset incremental cursor if the mailbox's UIDVALIDITY changed (UIDs reassigned).
    typ, vdata = imap.status(f'"{folder}"', "(UIDVALIDITY)")
    uidvalidity = re.search(rb"UIDVALIDITY (\d+)", vdata[0] or b"")
    uidvalidity = uidvalidity.group(1).decode() if uidvalidity else "0"
    fkey = f"{folder}:{uidvalidity}"
    last_uid = int(state.get(fkey, 0))

    typ, data = imap.uid("search", None, "ALL")
    all_uids = [int(u) for u in (data[0] or b"").split()]
    new_uids = [u for u in all_uids if u > last_uid]
    print(f"[newsletters] {len(all_uids)} messages, {len(new_uids)} new since UID {last_uid}")

    by_sender = {}   # slug -> list of new items
    seen_names = {}  # slug -> display name
    for u in new_uids:
        typ, mdata = imap.uid("fetch", str(u), "(RFC822)")
        if typ != "OK" or not mdata or not mdata[0]:
            continue
        msg = email.message_from_bytes(mdata[0][1])
        name, addr = parseaddr(msg.get("From", ""))
        if SKIP_SENDER_RE.search(addr):
            continue  # transactional/system mail, not a newsletter
        name = decode_header(name) or (addr.split("@")[0] if "@" in addr else "Unknown")
        domain = addr.split("@")[-1].lower() if "@" in addr else ""
        sid = "nl-" + slug(name)
        if sid in IGNORE_SLUGS:
            continue  # handled by a curated source — don't create a duplicate
        subject = decode_header(msg.get("Subject", "")) or "(no subject)"
        try:
            date = parsedate_to_datetime(msg.get("Date", "")).isoformat()
        except Exception:
            date = ""
        if not date:
            continue
        html = get_body(msg)
        mid = (msg.get("Message-ID") or f"uid-{uidvalidity}-{u}").strip("<> \t")
        link = view_in_browser(html) or f"mid:{mid}"
        by_sender.setdefault(sid, []).append({
            "title": subject, "link": link, "date": date,
            "content": html, "categories": [], "message_id": mid,
        })
        seen_names[sid] = name
        if domain and domain not in RELAY_DOMAINS and sid not in manifest:
            manifest.setdefault(sid, {})["_url_hint"] = f"https://{domain}"

    imap.logout()

    # Append-dedupe each sender's new items into its raw file (history accumulates).
    written = 0
    for sid, items in by_sender.items():
        out = os.path.join(DATA, f"raw_{sid}.jsonl")
        existing = []
        if os.path.exists(out):
            existing = [json.loads(l) for l in open(out) if l.strip()]
        seen = {it.get("message_id") or it.get("link") for it in existing}
        merged = list(existing)
        for it in items:
            k = it.get("message_id") or it.get("link")
            if k in seen:
                continue
            seen.add(k)
            merged.append(it)
        merged.sort(key=lambda it: it.get("date", ""), reverse=True)
        with open(out, "w") as f:
            for it in merged:
                f.write(json.dumps(it) + "\n")
        written += len(items)

        # Register / refresh the source in the manifest.
        entry = manifest.get(sid, {})
        url_hint = entry.pop("_url_hint", "") if isinstance(entry, dict) else ""
        manifest[sid] = {
            "id": sid,
            "name": entry.get("name") or seen_names.get(sid, sid),
            "blurb": entry.get("blurb") or "Newsletter (ingested via email).",
            "url": entry.get("url") or url_hint or "",
            "adapter": "rss",
            "category": entry.get("category", "publication"),
            "source_kind": "newsletter",
        }

    # Self-heal: drop sources that should never have existed (curated duplicates +
    # one-time junk created before the sender filters), deleting their raw files too.
    for dead in [s for s in manifest if s in IGNORE_SLUGS or s in PURGE_SLUGS]:
        manifest.pop(dead, None)
        try:
            os.remove(os.path.join(DATA, f"raw_{dead}.jsonl"))
        except FileNotFoundError:
            pass
        print(f"[newsletters] pruned stale source {dead}")

    if new_uids:
        state[fkey] = max(new_uids)
    json.dump(state, open(STATE, "w"), indent=1)
    json.dump(manifest, open(MANIFEST, "w"), indent=1, ensure_ascii=False)
    print(f"[newsletters] +{written} new items across {len(by_sender)} sender(s); "
          f"{len(manifest)} sources total")


if __name__ == "__main__":
    main()

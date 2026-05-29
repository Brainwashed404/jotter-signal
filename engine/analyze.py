#!/usr/bin/env python3
import json, re, collections
from urllib.parse import urlparse

rows = [json.loads(l) for l in open("data/posts_full.jsonl")]
def text(h): return re.sub(r"<[^>]+>", " ", h or "")
for r in rows:
    r["_t"] = (text(r["title"]["rendered"]) + " " + text(r["content"]["rendered"])).lower()
    r["_y"] = int(r["date"][:4])

# ---- controlled vocabulary: theme -> regex keyword alternatives ----
THEMES = {
 "AI & machine learning": r"\b(artificial intelligence|machine learning|\bai\b|neural net|deep learning|large language model|\bllm|gpt|chatgpt|openai|deepmind|generative ai)\b",
 "Surveillance & privacy": r"\b(surveillance|privacy|facial recognition|tracking|data protection|gdpr|nsa|snowden|spyware|pegasus)\b",
 "Platform power / Big Tech": r"\b(monopoly|antitrust|big tech|platform|gatekeeper|google|facebook|meta|amazon|apple|microsoft|market power)\b",
 "Social media & attention": r"\b(social media|twitter|\bx\b|tiktok|instagram|attention economy|engagement|viral|influencer|doomscroll)\b",
 "Democracy & disinformation": r"\b(democracy|disinformation|misinformation|propaganda|election|populism|fake news|polar'?i[sz]ation|authoritarian)\b",
 "Surveillance capitalism / data econ": r"\b(surveillance capitalism|data economy|behavioural data|zuboff|targeted advert|adtech|data broker)\b",
 "Climate & environment": r"\b(climate|carbon|emission|warming|fossil fuel|renewable|sustainab|biodiversity|anthropocene)\b",
 "Crypto / web3": r"\b(bitcoin|crypto|blockchain|web3|ethereum|nft|stablecoin|defi)\b",
 "Labour & automation": r"\b(automation|jobs|labour|gig economy|unemployment|future of work|robots? )\b",
 "Regulation & governance": r"\b(regulation|regulat|legislation|gdpr|antitrust|eu commission|policy|govern)\b",
 "Geopolitics & power": r"\b(china|russia|geopolit|sovereignty|cold war|ukraine|huawei|semiconductor|chips? act)\b",
 "Open internet / infrastructure": r"\b(open source|net neutrality|infrastructure|protocol|decentrali|fediverse|mastodon|web standard)\b",
}
THEMES = {k: re.compile(v) for k, v in THEMES.items()}

years = sorted({r["_y"] for r in rows})
per_year_total = collections.Counter(r["_y"] for r in rows)
# prevalence = fraction of that year's posts that touch the theme
prev = {t: {} for t in THEMES}
for t, rx in THEMES.items():
    hits = collections.Counter(r["_y"] for r in rows if rx.search(r["_t"]))
    for y in years:
        prev[t][y] = 100.0 * hits[y] / per_year_total[y]

# ---- print trajectory table for a readable set of years ----
cols = [2002,2006,2010,2014,2018,2020,2022,2024,2025,2026]
print("THEME PREVALENCE (% of that year's posts mentioning the theme)\n")
hdr = "theme".ljust(34) + "".join(str(y).rjust(6) for y in cols)
print(hdr); print("-"*len(hdr))
# sort themes by recent prevalence (2023-2026 avg)
def recent(t): return sum(prev[t][y] for y in (2023,2024,2025,2026))/4
for t in sorted(THEMES, key=recent, reverse=True):
    line = t.ljust(34) + "".join(f"{prev[t][y]:5.0f}" for y in cols)
    print(line)

print("\nposts/year:".ljust(34) + "".join(f"{per_year_total[y]:6d}" for y in cols))

# ---- external sources he surfaces (domains), recent vs early ----
def domains(yset):
    c = collections.Counter()
    for r in rows:
        if r["_y"] not in yset: continue
        for m in re.findall(r'href=["\']([^"\']+)["\']', r["content"]["rendered"]):
            try: d = urlparse(m).netloc.lower().replace("www.","")
            except Exception: continue
            if not d or "naughton" in d or d.endswith("wordpress.com") or d in ("youtube.com","youtu.be","twitter.com","x.com"): continue
            if any(d.endswith(ext) for ext in (".jpg",".png",".gif")): continue
            c[d]+=1
    return c

print("\nTOP SOURCES HE LINKS — 2002-2010 vs 2020-2026")
early = domains(set(range(2002,2011))); late = domains(set(range(2020,2027)))
print(f"{'early (2002-2010)':32}     {'recent (2020-2026)':32}")
e=early.most_common(15); l=late.most_common(15)
for i in range(15):
    a=f"{e[i][0]} ({e[i][1]})" if i<len(e) else ""
    b=f"{l[i][0]} ({l[i][1]})" if i<len(l) else ""
    print(f"{a:32}     {b:32}")

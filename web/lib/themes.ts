// Mirror of the engine's controlled theme vocabulary (engine/build_dataset.py),
// so excerpts can be auto-tagged client-side with the same themes used everywhere.
const THEME_PATTERNS: [string, RegExp][] = [
  ["AI & machine learning", /\b(artificial intelligence|machine learning|ai|neural net|deep learning|large language model|llm|gpt|chatgpt|openai|anthropic|deepmind|generative ai)\b/i],
  ["Platform power / Big Tech", /\b(monopoly|antitrust|big tech|platform|gatekeeper|google|facebook|meta|amazon|apple|microsoft|enshittif)/i],
  ["Democracy & disinformation", /\b(democracy|disinformation|misinformation|propaganda|election|populism|fake news|polari[sz]ation|authoritarian|fascis|coup)\b/i],
  ["Social media & attention", /\b(social media|twitter|tiktok|instagram|attention economy|engagement|viral|influencer|doomscroll)\b/i],
  ["Geopolitics & power", /\b(china|russia|geopolit|sovereignty|ukraine|huawei|semiconductor|tariff|nato)\b/i],
  ["Surveillance & privacy", /\b(surveillance|privacy|facial recognition|tracking|data protection|gdpr|spyware|pegasus|snowden)\b/i],
  ["Climate & environment", /\b(climate|carbon|emission|warming|fossil fuel|renewable|sustainab|biodiversity)\b/i],
  ["Crypto / web3", /\b(bitcoin|crypto|blockchain|web3|ethereum|nft|stablecoin)\b/i],
  ["Labour & automation", /\b(automation|jobs|labour|gig economy|unemployment|future of work)\b/i],
  ["Regulation & governance", /\b(regulation|regulat|legislation|antitrust|policy|govern|ofcom)/i],
  ["Economy & markets", /\b(inflation|recession|markets?|economy|economic|bubble|capital|austerity|gdp|interest rate)\b/i],
  ["Media & journalism", /\b(journalism|newspaper|media|bbc|the observer|broadcast|publishing)\b/i],
];

/** Themes whose keywords appear in the text. Empty array if none fit (e.g. a witty quip). */
export function themesFor(text: string): string[] {
  return THEME_PATTERNS.filter(([, rx]) => rx.test(text)).map(([t]) => t);
}

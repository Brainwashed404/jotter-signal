export type Signal = {
  id: string;
  post_id: number | string;
  date: string;
  year: number;
  source: string;
  source_id: string;
  type: string;
  heading: string;
  text: string;
  themes: string[];
  links: { url: string; domain: string; anchor: string }[];
  images?: string[];
  post_url: string;
};

export type ThemeSummary = {
  theme: string;
  current: number;
  delta: number;
  series: Record<string, number>;
};

// One curated expert + their aggregates (was "Radar").
export type Expert = {
  id: string;
  name: string;
  blurb: string;
  url: string;
  totals: { posts: number; signals: number; date_min: string; date_max: string };
  signal_types: Record<string, number>;
  themes: ThemeSummary[];
  years: string[];
  top_sources_recent: { domain: string; n: number }[];
  top_sources_early: { domain: string; n: number }[];
};

// Combined view across all experts.
export type Overview = {
  experts: { id: string; name: string }[];
  signals: number;
  posts: number;
  date_min: string;
  date_max: string;
  years: string[];
  themeNames: string[];
};

export const TYPE_LABEL: Record<string, string> = {
  article: "Article",
  longread: "Long Read",
  quote: "Quote",
  book: "Book",
  commonplace: "Commonplace",
  linkblog: "Linkblog",
  chart: "Chart",
  note: "Note",
};

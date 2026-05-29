export type Signal = {
  id: string;
  post_id: number;
  date: string;
  year: number;
  source: string;
  source_id: string;
  type: string;
  heading: string;
  text: string;
  themes: string[];
  links: { url: string; domain: string; anchor: string }[];
  post_url: string;
};

export type ThemeSummary = {
  theme: string;
  current: number;
  delta: number;
  series: Record<string, number>;
};

export type Radar = {
  totals: { posts: number; signals: number; date_min: string; date_max: string };
  signal_types: Record<string, number>;
  themes: ThemeSummary[];
  years: string[];
  top_sources_recent: { domain: string; n: number }[];
  top_sources_early: { domain: string; n: number }[];
};

export const TYPE_LABEL: Record<string, string> = {
  longread: "Long Read",
  quote: "Quote",
  book: "Book",
  commonplace: "Commonplace",
  linkblog: "Linkblog",
  chart: "Chart",
  feedback: "Feedback",
  note: "Note",
};

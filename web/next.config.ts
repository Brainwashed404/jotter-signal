import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // hide the dev-mode "N" badge in the corner
  // Bundle the pre-downloaded data files into every serverless function so the
  // app can read them from disk at runtime (no per-request network fetch to B2).
  experimental: {
    outputFileTracingIncludes: {
      "/**": ["./data/signals.jsonl.gz", "./data/experts.json"],
    },
  },
};

export default nextConfig;

import { loadData, getRecentFeed } from "@/lib/data";
import TrendingAndInsights from "@/components/TrendingAndInsights";
import WhatDidIMiss from "@/components/WhatDidIMiss";
import CollapsibleSection from "@/components/CollapsibleSection";
import MarketsSnapshot from "@/components/MarketsSnapshot";
import WorldCupChart from "@/components/WorldCupChart";
import CtaFooter from "@/components/CtaFooter";

export const revalidate = 300; // cache the page for 5 min; Vercel serves all visitors from one render

export default async function HomePage() {
  await loadData();
  const recentFeed = getRecentFeed(365, 10); // up to 10 per source, scanning a full year

  return (
    <div className="space-y-8">
      <TrendingAndInsights signals={recentFeed} />

      <WhatDidIMiss />

      <CollapsibleSection title="Markets">
        <MarketsSnapshot />
      </CollapsibleSection>

      <CollapsibleSection title="World Cup 2026" defaultOpen={true}>
        <WorldCupChart />
      </CollapsibleSection>

      <CtaFooter />
    </div>
  );
}

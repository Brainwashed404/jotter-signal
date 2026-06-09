import { loadData, getLatestPerExpert } from "@/lib/data";
import TrendingWidget from "@/components/TrendingWidget";
import CollapsibleSection from "@/components/CollapsibleSection";
import LatestInsights from "@/components/LatestInsights";
import MarketsSnapshot from "@/components/MarketsSnapshot";
import WorldCupChart from "@/components/WorldCupChart";
import CtaFooter from "@/components/CtaFooter";

export const revalidate = 300; // cache the page for 5 min; Vercel serves all visitors from one render

export default async function HomePage() {
  await loadData();
  const recentFeed = getLatestPerExpert(7); // ONE latest post per expert/publication, last 7 days

  return (
    <div className="space-y-8">
      <CollapsibleSection title="Trending News">
        <TrendingWidget />
      </CollapsibleSection>

      <CollapsibleSection title="Markets">
        <MarketsSnapshot />
      </CollapsibleSection>

      <CollapsibleSection title="World Cup 2026" defaultOpen={false}>
        <WorldCupChart />
      </CollapsibleSection>

      <CollapsibleSection title="Latest Insights">
        {recentFeed.length === 0 ? (
          <div className="label">No expert has posted in the past 7 days.</div>
        ) : (
          <LatestInsights signals={recentFeed} />
        )}
      </CollapsibleSection>

      <CtaFooter />
    </div>
  );
}

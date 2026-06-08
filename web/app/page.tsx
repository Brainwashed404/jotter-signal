import { loadData, getLatestPerExpert } from "@/lib/data";
import TrendingWidget from "@/components/TrendingWidget";
import CollapsibleSection from "@/components/CollapsibleSection";
import LatestInsights from "@/components/LatestInsights";
import MarketsSnapshot from "@/components/MarketsSnapshot";
import CtaFooter from "@/components/CtaFooter";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await loadData();
  const latestPerExpert = getLatestPerExpert(28);

  return (
    <div className="space-y-8">
      <CollapsibleSection title="Trending News">
        <TrendingWidget />
      </CollapsibleSection>

      <CollapsibleSection title="Markets">
        <MarketsSnapshot />
      </CollapsibleSection>

      <CollapsibleSection title="Latest Expert Insights">
        {latestPerExpert.length === 0 ? (
          <div className="label">No expert has posted in the past 4 weeks.</div>
        ) : (
          <LatestInsights signals={latestPerExpert} />
        )}
      </CollapsibleSection>

      <CtaFooter />
    </div>
  );
}

import { loadData, getExperts } from "@/lib/data";
import SourcesGrid from "@/components/SourcesGrid";
import CollapsibleSection from "@/components/CollapsibleSection";
import CtaFooter from "@/components/CtaFooter";

export default async function SourcesPage() {
  await loadData();
  const experts = getExperts().filter((e) => (e.category ?? "author") === "author");
  return (
    <div className="space-y-6">
      <CollapsibleSection title="Authors">
        <SourcesGrid experts={experts} />
      </CollapsibleSection>

      <CtaFooter />
    </div>
  );
}

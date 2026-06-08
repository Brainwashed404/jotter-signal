import { loadData, getExperts } from "@/lib/data";
import SourcesGrid from "@/components/SourcesGrid";
import CollapsibleSection from "@/components/CollapsibleSection";
import CtaFooter from "@/components/CtaFooter";

export default async function PublicationsPage() {
  await loadData();
  const pubs = getExperts().filter((e) => e.category === "publication");
  return (
    <div className="space-y-6">
      <CollapsibleSection title="Publications">
        <SourcesGrid experts={pubs} basePath="/publications" />
      </CollapsibleSection>

      <CtaFooter />
    </div>
  );
}

import { loadData, getExperts } from "@/lib/data";
import SourcesBrowser from "@/components/SourcesBrowser";
import CtaFooter from "@/components/CtaFooter";

export default async function SourcesPage() {
  await loadData();
  const all = getExperts();
  const authors = all.filter((e) => (e.category ?? "author") === "author");
  const publications = all.filter((e) => e.category === "publication");
  return (
    <div className="space-y-6">
      <SourcesBrowser authors={authors} publications={publications} />
      <CtaFooter />
    </div>
  );
}

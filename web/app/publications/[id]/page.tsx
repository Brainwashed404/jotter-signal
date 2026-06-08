import SourceProfile from "@/components/SourceProfile";

export default async function PublicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SourceProfile id={id} backHref="/publications" backLabel="all publications" />;
}

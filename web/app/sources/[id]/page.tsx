import SourceProfile from "@/components/SourceProfile";

export default async function AuthorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SourceProfile id={id} backHref="/sources" backLabel="all experts" />;
}

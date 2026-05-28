import { StackListPage } from "@/features/hosting/pages/StackListPage";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StackListPage namespaceSlug={slug} />;
}

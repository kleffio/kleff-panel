import { StackServersPage } from "@/features/hosting/pages/StackServersPage";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; stackId: string }>;
}) {
  const { slug, stackId } = await params;
  return <StackServersPage namespaceSlug={slug} stackId={stackId} />;
}

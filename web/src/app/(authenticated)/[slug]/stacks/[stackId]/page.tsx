import { StackOverviewPage } from "@/features/hosting/pages/StackOverviewPage";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; stackId: string }>;
}) {
  const { slug, stackId } = await params;
  return <StackOverviewPage namespaceSlug={slug} stackId={stackId} />;
}

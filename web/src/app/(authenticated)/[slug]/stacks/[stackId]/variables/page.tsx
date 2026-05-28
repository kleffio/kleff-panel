import { StackComingSoonPage } from "@/features/hosting/pages/StackComingSoonPage";

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string; stackId: string }>;
}) {
  const { slug, stackId } = await params;
  return <StackComingSoonPage namespaceSlug={slug} stackId={stackId} section="Variables" />;
}

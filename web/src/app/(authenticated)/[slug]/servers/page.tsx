import { SimpleServersPage } from "@/features/hosting/pages/SimpleServersPage";

// Phase 1: flat namespace-level servers route.
// Renders all workloads belonging to the namespace at /[slug]/servers
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SimpleServersPage namespaceSlug={slug} />;
}

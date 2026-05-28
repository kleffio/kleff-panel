"use client";

import { useParams } from "next/navigation";
import { ServerOverviewPage } from "@/features/hosting/pages/ServerOverviewPage";
import type { EnvironmentScope } from "@/lib/api/projects";

export default function ServerPage() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const nsScope: EnvironmentScope = { namespaceSlug: slug };

  return <ServerOverviewPage projectID="" workloadID={id} scope={nsScope} />;
}

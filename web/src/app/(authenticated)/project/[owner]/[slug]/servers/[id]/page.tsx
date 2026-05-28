"use client";

import { useParams } from "next/navigation";
import { useCurrentProject } from "@/features/projects/model/CurrentProjectProvider";
import { ServerOverviewPage } from "@/features/hosting/pages/ServerOverviewPage";
import type { EnvironmentScope } from "@/lib/api/projects";

export default function ServerPage() {
  const { owner, slug, id } = useParams<{ owner: string; slug: string; id: string }>();
  const { projects, isLoading } = useCurrentProject();

  const project =
    projects.find((p) => p.slug === slug) ??
    projects.find(
      (p) =>
        (p as { namespace_slug?: string; environment_slug?: string }).namespace_slug === owner &&
        (p as { namespace_slug?: string; environment_slug?: string }).environment_slug === slug
    );

  const nsScope: EnvironmentScope | undefined =
    !project ? { namespaceSlug: owner, environmentSlug: slug } : undefined;

  if (isLoading && !project) return null;

  return <ServerOverviewPage projectID={project?.id ?? ""} workloadID={id} scope={nsScope} />;
}

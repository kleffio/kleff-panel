"use client";

import { useParams } from "next/navigation";
import type { EnvironmentScope } from "@/lib/api/projects";

export function useServerContext() {
  const { slug, id } = useParams<{ slug: string; id: string }>();
  const nsScope: EnvironmentScope = { namespaceSlug: slug };
  return { nsScope, workloadID: id };
}

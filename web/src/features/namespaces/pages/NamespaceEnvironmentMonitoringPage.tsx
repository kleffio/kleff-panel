"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getEnvironment } from "@/lib/api/namespaces";
import { MonitoringPage } from "@/features/monitoring/pages/MonitoringPage";

export function NamespaceEnvironmentMonitoringPage() {
  const { slug, environment } = useParams<{ slug: string; environment: string }>();

  const envQuery = useQuery({
    queryKey: ["environment", slug, environment],
    queryFn: () => getEnvironment(slug, environment),
  });

  if (envQuery.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-white/30" />
      </div>
    );
  }

  if (!envQuery.data) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center px-4">
        <p className="text-sm text-white/40">Environment not found.</p>
        <a href={`/${slug}`} className="text-xs text-primary hover:underline">
          ← Back to namespace
        </a>
      </div>
    );
  }

  return <MonitoringPage projectID={envQuery.data.id} />;
}

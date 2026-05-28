"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, Loader2, Terminal } from "lucide-react";
import { listWorkloads } from "@/lib/api/projects";
import { LogViewer } from "@/features/hosting/ui/LogViewer";
import type { EnvironmentScope } from "@/lib/api/projects";

export function EnvironmentLogsPage() {
  const { slug, environment } = useParams<{ slug: string; environment: string }>();
  const scope: EnvironmentScope = { namespaceSlug: slug, environmentSlug: environment };

  const workloadsQuery = useQuery({
    queryKey: ["workloads", slug, environment],
    queryFn: () => listWorkloads("", scope),
    refetchInterval: 15_000,
  });

  const workloads = workloadsQuery.data?.workloads?.filter((w) => w.state !== "deleted") ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeId = selectedId ?? workloads[0]?.id ?? null;
  const activeWorkload = workloads.find((w) => w.id === activeId);

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] mx-auto max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white">Logs</h1>
          <p className="text-[12px] text-white/35 mt-0.5">Real-time output from your workloads</p>
        </div>

        {/* Workload selector */}
        {workloads.length > 1 && (
          <div className="relative">
            <select
              value={activeId ?? ""}
              onChange={(e) => setSelectedId(e.target.value)}
              className="appearance-none rounded-lg border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 pr-8 text-xs text-white/70 hover:bg-white/[0.07] focus:outline-none cursor-pointer"
            >
              {workloads.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name || w.id.slice(0, 8)}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 size-3 text-white/40" />
          </div>
        )}
      </div>

      {/* Log area */}
      <div className="flex-1 min-h-0 rounded-2xl border border-white/[0.07] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02] shrink-0">
          <Terminal className="size-3.5 text-white/40" />
          <span className="text-[12px] font-semibold text-white/60">
            {activeWorkload?.name || (activeId ? activeId.slice(0, 8) + "…" : "Log stream")}
          </span>
          {activeId && (
            <div className="ml-auto flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-400/60" />
              <span className="text-[10px] text-white/25">Live</span>
            </div>
          )}
        </div>

        {workloadsQuery.isLoading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-white/20" />
          </div>
        ) : workloads.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-sm text-white/30">No running workloads</p>
            <p className="text-xs text-white/20">Start a server to see its logs here.</p>
          </div>
        ) : activeId ? (
          <LogViewer workloadId={activeId} projectID="" scope={scope} />
        ) : null}
      </div>
    </div>
  );
}

"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Server, X } from "lucide-react";
import { toast } from "sonner";

import { listCanvasGroups, upsertCanvasGroup, type CanvasGroupDTO } from "@/lib/api/canvas_groups";
import { listWorkloadsByNamespace } from "@/lib/api/projects";
import type { WorkloadDTO } from "@/lib/api/projects";

function statusDot(state: WorkloadDTO["state"]) {
  if (state === "running") return "bg-emerald-400";
  if (state === "failed") return "bg-red-400";
  return "animate-pulse bg-amber-400";
}

function statusLabel(state: WorkloadDTO["state"]) {
  if (state === "running") return "Running";
  if (state === "stopped") return "Stopped";
  if (state === "failed") return "Failed";
  if (state === "pending") return "Pending";
  return state;
}

export function StackServersPage({
  namespaceSlug,
  stackId,
}: {
  namespaceSlug: string;
  stackId: string;
}) {
  const queryClient = useQueryClient();

  const { data: groupsData } = useQuery({
    queryKey: ["canvas-groups", namespaceSlug],
    queryFn: () => listCanvasGroups(namespaceSlug),
    enabled: !!namespaceSlug,
  });

  const group = (groupsData?.groups ?? []).find((g) => g.id === stackId) ?? null;

  const handleRemove = useCallback(
    async (workloadId: string, name: string) => {
      if (!group) return;
      const newMemberIds = group.member_ids.filter((id) => id !== workloadId);
      await upsertCanvasGroup(namespaceSlug, stackId, {
        label: group.label,
        color: group.color,
        member_ids: newMemberIds,
        notes: group.notes,
        role: group.role,
        pos_x: group.pos_x,
        pos_y: group.pos_y,
        width: group.width,
        height: group.height,
      }).catch(() => {});
      queryClient.setQueryData<{ groups: CanvasGroupDTO[] }>(
        ["canvas-groups", namespaceSlug],
        (old) => ({
          groups: (old?.groups ?? []).map((g) =>
            g.id === stackId ? { ...g, member_ids: newMemberIds } : g
          ),
        }),
      );
      toast.success(`Removed "${name}" from stack`);
    },
    [group, namespaceSlug, stackId, queryClient],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["workloads", namespaceSlug],
    queryFn: () => listWorkloadsByNamespace(namespaceSlug),
    enabled: !!namespaceSlug,
  });

  const memberWorkloads = group
    ? (data?.workloads ?? []).filter((w) => group.member_ids.includes(w.id))
    : [];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/25">
          Servers
        </h2>

        {isLoading ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
          >
            {Array.from({ length: Math.max(2, group?.member_ids.length ?? 2) }).map((_, i) => (
              <div key={i} className="h-[72px] rounded-2xl border border-white/[0.06] bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : memberWorkloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.015] py-12 text-center">
            <Server className="size-5 text-white/15 mb-2.5" />
            <p className="text-[12px] text-white/30">No servers in this stack.</p>
            <p className="mt-1 text-[11px] text-white/20">
              Drag servers into this group on the{" "}
              <Link href={`/${namespaceSlug}/canvas`} className="underline underline-offset-2 hover:text-white/40 transition-colors">
                canvas
              </Link>
              .
            </p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}
          >
            {memberWorkloads.map((w) => (
              <ServerCard
                key={w.id}
                workload={w}
                namespaceSlug={namespaceSlug}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ServerCard({
  workload,
  namespaceSlug,
  onRemove,
}: {
  workload: WorkloadDTO;
  namespaceSlug: string;
  onRemove: (id: string, name: string) => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 hover:bg-white/[0.035] transition-colors">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-[13px] font-medium text-white/80">{workload.name}</p>
        <div className="flex items-center gap-1.5">
          <span className={`size-1.5 shrink-0 rounded-full ${statusDot(workload.state)}`} />
          <span className="text-[11px] text-white/35">{statusLabel(workload.state)}</span>
        </div>
      </div>
      <button
        onClick={() => onRemove(workload.id, workload.name)}
        className="grid size-6 shrink-0 place-items-center rounded-lg border border-transparent text-white/15 opacity-0 transition-all group-hover:opacity-100 hover:border-red-500/20 hover:bg-red-500/[0.08] hover:text-red-400/70"
        title="Remove from stack"
      >
        <X className="size-3" />
      </button>
      <Link
        href={`/${namespaceSlug}/servers/${workload.id}`}
        className="shrink-0 grid size-6 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.03] text-white/30 hover:bg-white/[0.08] hover:text-white/60 transition-colors"
      >
        <ArrowUpRight className="size-3" />
      </Link>
    </div>
  );
}

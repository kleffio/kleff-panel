"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Layers, Server } from "lucide-react";

import { listCanvasGroups } from "@/lib/api/canvas_groups";
import { GROUP_ROLES } from "@/features/hosting/ui/GroupManagerModal";
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

export function StackOverviewPage({
  namespaceSlug,
  stackId,
}: {
  namespaceSlug: string;
  stackId: string;
}) {
  const { data: groupsData } = useQuery({
    queryKey: ["canvas-groups", namespaceSlug],
    queryFn: () => listCanvasGroups(namespaceSlug),
    enabled: !!namespaceSlug,
  });

  const group = (groupsData?.groups ?? []).find((g) => g.id === stackId) ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["workloads", namespaceSlug],
    queryFn: () => listWorkloadsByNamespace(namespaceSlug),
    enabled: !!namespaceSlug,
  });

  if (!group) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-[13px] text-white/40">Stack not found.</p>
      </div>
    );
  }

  const memberWorkloads = (data?.workloads ?? []).filter((w) =>
    group.member_ids.includes(w.id),
  );

  const running = memberWorkloads.filter((w) => w.state === "running").length;
  const failed = memberWorkloads.filter((w) => w.state === "failed").length;

  const roleInfo = GROUP_ROLES.find((r) => r.id === group.role);
  const { color } = group;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-8 space-y-6">

        {/* Stack header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="size-2.5 shrink-0 rounded-full mt-0.5" style={{ backgroundColor: color }} />
              <h1 className="text-[18px] font-semibold text-white/90">
                {group.label}
              </h1>
              {roleInfo && (
                <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] text-white/40">
                  {roleInfo.label}
                </span>
              )}
            </div>
            {group.notes && (
              <p className="mt-2 text-[13px] text-white/40 leading-relaxed">{group.notes}</p>
            )}
          </div>
          <Link
            href={`/${namespaceSlug}/canvas`}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/40 hover:bg-white/[0.06] hover:text-white/70 transition-colors"
          >
            <Layers className="size-3" />
            Canvas
          </Link>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Total" value={isLoading ? "—" : String(memberWorkloads.length)} />
          <StatCard label="Running" value={isLoading ? "—" : String(running)} accent="text-emerald-400" />
          <StatCard label="Issues" value={isLoading ? "—" : String(failed)} accent={failed > 0 ? "text-red-400" : undefined} />
        </div>

        {/* Servers section */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-white/25">
              Servers
            </h2>
            {memberWorkloads.length > 0 && (
              <Link
                href={`/${namespaceSlug}/stacks/${stackId}/servers`}
                className="flex items-center gap-1 text-[11px] text-white/30 hover:text-white/60 transition-colors"
              >
                View all
                <ArrowUpRight className="size-3" />
              </Link>
            )}
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 rounded-xl border border-white/[0.05] bg-white/[0.02] animate-pulse" />
              ))}
            </div>
          ) : memberWorkloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.015] py-10 text-center">
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
            <div className="space-y-1.5">
              {memberWorkloads.slice(0, 5).map((w) => (
                <ServerRow key={w.id} workload={w} namespaceSlug={namespaceSlug} />
              ))}
              {memberWorkloads.length > 5 && (
                <Link
                  href={`/${namespaceSlug}/stacks/${stackId}/servers`}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.05] bg-white/[0.01] py-2.5 text-[11px] text-white/30 hover:text-white/60 transition-colors"
                >
                  +{memberWorkloads.length - 5} more servers
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
      <p className={`text-[20px] font-semibold leading-none ${accent ?? "text-white/80"}`}>{value}</p>
      <p className="mt-1.5 text-[11px] text-white/30">{label}</p>
    </div>
  );
}

function ServerRow({ workload, namespaceSlug }: { workload: WorkloadDTO; namespaceSlug: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3.5 py-2.5 hover:bg-white/[0.035] transition-colors">
      <span className={`size-1.5 shrink-0 rounded-full ${statusDot(workload.state)}`} />
      <span className="flex-1 truncate text-[13px] text-white/75">{workload.name}</span>
      <span className="text-[11px] text-white/30">{statusLabel(workload.state)}</span>
      <Link
        href={`/${namespaceSlug}/servers/${workload.id}`}
        className="grid size-5 place-items-center rounded-md border border-white/[0.07] bg-white/[0.03] text-white/25 hover:bg-white/[0.08] hover:text-white/60 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <ArrowUpRight className="size-3" />
      </Link>
    </div>
  );
}

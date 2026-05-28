"use client";

import { useCallback } from "react";
import Link from "next/link";
import { ArrowUpRight, Layers, Plus, Server } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { listCanvasGroups, deleteCanvasGroup, type CanvasGroupDTO } from "@/lib/api/canvas_groups";
import { GROUP_ROLES } from "@/features/hosting/ui/GroupManagerModal";

export function StackListPage({ namespaceSlug }: { namespaceSlug: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["canvas-groups", namespaceSlug],
    queryFn: () => listCanvasGroups(namespaceSlug),
    enabled: !!namespaceSlug,
  });

  const groups = data?.groups ?? [];

  const handleDelete = useCallback(
    async (groupId: string, label: string) => {
      await deleteCanvasGroup(namespaceSlug, groupId).catch(() => {});
      queryClient.setQueryData<{ groups: CanvasGroupDTO[] }>(
        ["canvas-groups", namespaceSlug],
        (old) => ({ groups: (old?.groups ?? []).filter((g) => g.id !== groupId) }),
      );
      toast.success(`Deleted "${label}"`);
    },
    [namespaceSlug, queryClient],
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Stacks</h1>
            <p className="mt-0.5 text-[13px] text-white/40">
              Groups of servers organized on the canvas.
            </p>
          </div>
          <Link
            href={`/${namespaceSlug}/canvas`}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-white/[0.06] border border-white/[0.08] text-[12px] font-medium text-white/70 hover:bg-white/[0.09] hover:text-white/90 transition-colors"
          >
            <Plus className="size-3.5" />
            New stack
          </Link>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
          >
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-[112px] rounded-[18px] border border-white/[0.07] bg-white/[0.02] animate-pulse" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] py-20 text-center">
            <Layers className="size-8 text-white/20 mb-3" />
            <p className="text-[13px] text-white/40">No stacks yet.</p>
            <p className="mt-1 text-[12px] text-white/25">
              Create one from the{" "}
              <Link href={`/${namespaceSlug}/canvas`} className="underline underline-offset-2 hover:text-white/50 transition-colors">
                canvas
              </Link>
              .
            </p>
          </div>
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
          >
            {groups.map((group) => (
              <StackCard key={group.id} group={group} namespaceSlug={namespaceSlug} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StackCard({
  group,
  namespaceSlug,
  onDelete,
}: {
  group: CanvasGroupDTO;
  namespaceSlug: string;
  onDelete: (id: string, label: string) => void;
}) {
  const roleInfo = GROUP_ROLES.find((r) => r.id === group.role);
  const { color } = group;
  const count = group.member_ids.length;

  return (
    <div
      className="group relative flex flex-col gap-3 rounded-[18px] border border-white/[0.07] bg-[#0e0f13] p-4 transition-all hover:border-white/[0.11] hover:bg-[#111318]"
      style={{
        backgroundImage: `linear-gradient(150deg, ${color}16 0%, transparent 55%)`,
      }}
    >
      {/* Top row: badge + info + link */}
      <div className="flex items-start gap-3">
        {/* Color badge */}
        <div
          className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-[11px] font-black"
          style={{
            background: `${color}28`,
            boxShadow: `0 0 0 1px ${color}45`,
            color,
          }}
        >
          <Layers className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <Link
            href={`/${namespaceSlug}/stacks/${group.id}`}
            className="block truncate text-[13px] font-semibold text-white/85 hover:text-white transition-colors"
          >
            {group.label}
          </Link>
          <span className="text-[10px] uppercase tracking-[0.1em] text-white/30">
            {roleInfo?.label ?? "Stack"}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Link
            href={`/${namespaceSlug}/stacks/${group.id}`}
            className="grid size-6 place-items-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/30 hover:bg-white/[0.08] hover:text-white/60 transition-colors"
          >
            <ArrowUpRight className="size-3" />
          </Link>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onDelete(group.id, group.label);
            }}
            className="grid size-6 place-items-center rounded-lg border border-transparent text-white/15 opacity-0 transition-all group-hover:opacity-100 hover:border-red-500/20 hover:bg-red-500/[0.08] hover:!text-red-400/70"
          >
            ×
          </button>
        </div>
      </div>

      {/* Server count row */}
      <div className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.025] px-2.5 py-1.5">
        <div className="flex items-center gap-1.5">
          <Server className="size-3 text-white/25" />
          <span className="text-[11px] text-white/45">
            {count === 0 ? "No servers" : `${count} server${count === 1 ? "" : "s"}`}
          </span>
        </div>
        {group.notes ? (
          <span className="max-w-[120px] truncate text-[10px] text-white/25">{group.notes}</span>
        ) : null}
      </div>
    </div>
  );
}

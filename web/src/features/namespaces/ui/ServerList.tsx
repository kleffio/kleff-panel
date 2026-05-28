"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Square,
  RotateCcw,
  Loader2,
  Plus,
  Server,
  Cpu,
  MemoryStick,
  Clock,
  Terminal,
} from "lucide-react";
import { type WorkloadDTO } from "@/lib/api/projects";
import { stopServer, startServer, restartServer } from "@/lib/api/deployments";
import { cn } from "@kleffio/ui";
import { toast } from "sonner";
import Link from "next/link";
import { useUserUIMode } from "@/lib/hooks/useUserUIMode";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatMemory(bytes: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${Math.round(gb)} GB` : `${Math.round(bytes / (1024 * 1024))} MB`;
}

function formatCPU(millicores: number): string | null {
  if (!millicores || millicores <= 0) return null;
  const vcpu = millicores / 1000;
  return `${vcpu % 1 === 0 ? vcpu : vcpu.toFixed(1)} vCPU`;
}

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

// ── State config ───────────────────────────────────────────────────────────

const STATE_CFG = {
  running: {
    dot: "bg-emerald-400",
    dotAnim: "",
    glow: "shadow-[0_0_8px_oklch(0.74_0.17_160_/_0.35)]",
    label: "Running",
    labelColor: "text-emerald-400/80",
    rowAccent: "border-l-emerald-500/40",
  },
  pending: {
    dot: "bg-amber-400",
    dotAnim: "animate-pulse",
    glow: "",
    label: "Starting",
    labelColor: "text-amber-400/80",
    rowAccent: "border-l-amber-500/40",
  },
  stopped: {
    dot: "bg-white/20",
    dotAnim: "",
    glow: "",
    label: "Stopped",
    labelColor: "text-white/25",
    rowAccent: "border-l-white/[0.08]",
  },
  failed: {
    dot: "bg-rose-400",
    dotAnim: "",
    glow: "shadow-[0_0_8px_oklch(0.63_0.20_25_/_0.3)]",
    label: "Failed",
    labelColor: "text-rose-400/80",
    rowAccent: "border-l-rose-500/40",
  },
  deleted: {
    dot: "bg-white/10",
    dotAnim: "",
    glow: "",
    label: "Deleted",
    labelColor: "text-white/15",
    rowAccent: "border-l-white/[0.04]",
  },
} as const;

// ── Server row ─────────────────────────────────────────────────────────────

function ServerRow({
  workload,
  namespaceSlug,
  environmentSlug,
}: {
  workload: WorkloadDTO;
  namespaceSlug: string;
  environmentSlug: string;
}) {
  const qc = useQueryClient();

  const state = (workload.state in STATE_CFG
    ? workload.state
    : "stopped") as keyof typeof STATE_CFG;
  const cfg = STATE_CFG[state];

  const mem = formatMemory(workload.memory_bytes);
  const cpu = formatCPU(workload.cpu_millicores);

  const actionMut = useMutation({
    mutationFn: (action: "start" | "stop" | "restart") => {
      const scope = { namespaceSlug, environmentSlug };
      if (action === "start") return startServer("", workload.id, scope);
      if (action === "stop") return stopServer("", workload.id, scope);
      return restartServer("", workload.id, scope);
    },
    onSuccess: (_, action) => {
      toast.success(
        action === "start" ? "Starting…" :
        action === "stop"  ? "Stopping…" :
        "Restarting…"
      );
      void qc.invalidateQueries({ queryKey: ["workloads", namespaceSlug, environmentSlug] });
    },
    onError: () => toast.error("Action failed"),
  });

  const canStart   = state === "stopped" || state === "failed";
  const canStop    = state === "running"  || state === "pending";
  const canRestart = state === "running";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className={cn(
        "group flex items-center gap-3 border-b border-white/[0.04] border-l-2 px-4 py-3 transition-colors hover:bg-white/[0.025]",
        cfg.rowAccent
      )}
    >
      {/* Status dot */}
      <div className="shrink-0 flex items-center justify-center w-4">
        <span
          className={cn("size-2 rounded-full", cfg.dot, cfg.dotAnim, cfg.glow)}
        />
      </div>

      {/* Name + endpoint */}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-white/85 truncate leading-tight">
          {workload.name}
        </p>
        {workload.endpoint ? (
          <p className="text-[11px] font-mono text-white/30 truncate mt-0.5">
            {workload.endpoint}
          </p>
        ) : (
          <p className="text-[11px] text-white/15 mt-0.5">No endpoint</p>
        )}
      </div>

      {/* State label — hidden on small widths */}
      <span className={cn("hidden sm:block text-[11px] font-medium w-14 shrink-0 text-right", cfg.labelColor)}>
        {cfg.label}
      </span>

      {/* Resource pills */}
      <div className="hidden md:flex items-center gap-1.5 shrink-0">
        {cpu && (
          <span className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/30">
            <Cpu className="size-2.5" />
            {cpu}
          </span>
        )}
        {mem && (
          <span className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/30">
            <MemoryStick className="size-2.5" />
            {mem}
          </span>
        )}
        <span className="flex items-center gap-1 rounded-md border border-white/[0.06] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/25">
          <Clock className="size-2.5" />
          {timeAgo(workload.created_at)}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 shrink-0">
        {canStart && (
          <button
            onClick={() => actionMut.mutate("start")}
            disabled={actionMut.isPending}
            title="Start"
            className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-[11px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
          >
            {actionMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
            <span className="hidden sm:inline">Start</span>
          </button>
        )}
        {canStop && (
          <button
            onClick={() => actionMut.mutate("stop")}
            disabled={actionMut.isPending}
            title="Stop"
            className="flex items-center gap-1 h-7 px-2.5 rounded-lg border border-white/[0.08] bg-white/[0.04] text-[11px] font-medium text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-colors disabled:opacity-40"
          >
            {actionMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3" />}
            <span className="hidden sm:inline">Stop</span>
          </button>
        )}
        {canRestart && (
          <button
            onClick={() => actionMut.mutate("restart")}
            disabled={actionMut.isPending}
            title="Restart"
            className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/30 hover:text-white/60 hover:bg-white/[0.08] transition-colors disabled:opacity-40"
          >
            {actionMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
          </button>
        )}

        {/* Manage link — canvas for now */}
        <Link
          href={`/${namespaceSlug}/${environmentSlug}/canvas`}
          title="Manage"
          className="h-7 w-7 flex items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.02] text-white/20 hover:text-white/55 hover:border-white/[0.12] hover:bg-white/[0.05] transition-colors opacity-0 group-hover:opacity-100"
        >
          <Terminal className="size-3" />
        </Link>
      </div>
    </motion.div>
  );
}

// ── Server list ────────────────────────────────────────────────────────────

export function ServerList({
  workloads,
  namespaceSlug,
  environmentSlug,
  onDeploy,
  isFetching,
  embedded,
}: {
  workloads: WorkloadDTO[];
  namespaceSlug: string;
  environmentSlug: string;
  onDeploy: () => void;
  isFetching?: boolean;
  embedded?: boolean;
}) {
  const isAdvanced = useUserUIMode() === "advanced";
  const noun = isAdvanced ? "node" : "server";
  const nounPlural = isAdvanced ? "nodes" : "servers";

  const running = workloads.filter((w) => w.state === "running").length;
  const stopped = workloads.filter((w) => w.state === "stopped").length;
  const pending = workloads.filter((w) => w.state === "pending").length;
  const failed  = workloads.filter((w) => w.state === "failed").length;

  if (workloads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center px-6">
        <div className="flex size-14 items-center justify-center rounded-2xl border border-white/[0.07] bg-white/[0.03]">
          <Server className="size-6 text-white/15" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white/40">No {nounPlural} yet</p>
          <p className="text-[12px] text-white/25 mt-1">Add your first {noun} to get started.</p>
        </div>
        <button
          onClick={onDeploy}
          className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary/10 border border-primary/20 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-all"
        >
          <Plus className="size-3.5" />
          Add {noun}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col", !embedded && "h-full")}>
      {/* List toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/20">
            {workloads.length} {workloads.length === 1 ? noun : nounPlural}
          </span>
          {running > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-emerald-400/70">
              <span className="size-1.5 rounded-full bg-emerald-400" />
              {running} running
            </span>
          )}
          {pending > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400/70">
              <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
              {pending} starting
            </span>
          )}
          {stopped > 0 && (
            <span className="hidden sm:flex items-center gap-1 text-[10px] text-white/20">
              <span className="size-1.5 rounded-full bg-white/15" />
              {stopped} stopped
            </span>
          )}
          {failed > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-rose-400/70">
              <span className="size-1.5 rounded-full bg-rose-400" />
              {failed} failed
            </span>
          )}
          {isFetching && <div className="size-1.5 rounded-full bg-primary/40 animate-pulse" />}
        </div>
        <button
          onClick={onDeploy}
          className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-primary/10 border border-primary/20 text-[11px] font-semibold text-primary/80 hover:bg-primary/20 hover:border-primary/30 transition-all"
        >
          <Plus className="size-3" />
          Add {noun}
        </button>
      </div>

      {/* Rows */}
      <div className={cn(embedded ? "overflow-y-auto" : "flex-1 overflow-y-auto")}>
        <AnimatePresence initial={false}>
          {workloads.map((w) => (
            <ServerRow
              key={w.id}
              workload={w}
              namespaceSlug={namespaceSlug}
              environmentSlug={environmentSlug}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

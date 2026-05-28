"use client";

import { useRef, useCallback, useState } from "react";
import { motion, useMotionValue } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Circle,
  Play,
  Square,
  RotateCcw,
  Loader2,
  Plus,
  Globe,
} from "lucide-react";
import { type WorkloadDTO } from "@/lib/api/projects";
import { stopServer, startServer, restartServer } from "@/lib/api/deployments";
import { cn } from "@kleffio/ui";
import { toast } from "sonner";

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

const STATE_CFG = {
  running: {
    dot: "fill-emerald-400 text-emerald-400",
    badge: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    label: "Running",
    glow: "shadow-[0_0_18px_oklch(0.8_0.17_90_/_0.12),inset_0_0_0_1px_oklch(1_0_0_/_0.07)]",
  },
  pending: {
    dot: "fill-yellow-400 text-yellow-400",
    badge: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
    label: "Pending",
    glow: "shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.06)]",
  },
  stopped: {
    dot: "fill-white/25 text-white/25",
    badge: "text-white/35 bg-white/[0.04] border-white/[0.08]",
    label: "Stopped",
    glow: "shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.05)]",
  },
  failed: {
    dot: "fill-rose-400 text-rose-400",
    badge: "text-rose-400 bg-rose-400/10 border-rose-400/20",
    label: "Failed",
    glow: "shadow-[0_0_14px_oklch(0.65_0.25_15_/_0.18),inset_0_0_0_1px_oklch(1_0_0_/_0.06)]",
  },
  deleted: {
    dot: "fill-white/15 text-white/15",
    badge: "text-white/20 bg-white/[0.02] border-white/[0.04]",
    label: "Deleted",
    glow: "shadow-[inset_0_0_0_1px_oklch(1_0_0_/_0.04)]",
  },
} as const;

// ── Position persistence ───────────────────────────────────────────────────

function posKey(scope: string, id: string) {
  return `kleff:canvas:${scope}:${id}`;
}

function loadPos(scope: string, id: string): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(posKey(scope, id));
    if (!raw) return null;
    const p = JSON.parse(raw) as { x: number; y: number };
    return typeof p.x === "number" && typeof p.y === "number" ? p : null;
  } catch {
    return null;
  }
}

function savePos(scope: string, id: string, pos: { x: number; y: number }) {
  try {
    localStorage.setItem(posKey(scope, id), JSON.stringify(pos));
  } catch {}
}


// ── Server card ────────────────────────────────────────────────────────────

function ServerCard({
  workload,
  namespaceSlug,
  environmentSlug,
  initialPos,
  scope,
  onDragEnd,
}: {
  workload: WorkloadDTO;
  namespaceSlug: string;
  environmentSlug: string;
  initialPos: { x: number; y: number };
  scope: string;
  onDragEnd: (id: string, pos: { x: number; y: number }) => void;
}) {
  const qc = useQueryClient();
  const [isDragging, setIsDragging] = useState(false);
  const x = useMotionValue(initialPos.x);
  const y = useMotionValue(initialPos.y);

  const state = (workload.state in STATE_CFG ? workload.state : "stopped") as keyof typeof STATE_CFG;
  const cfg = STATE_CFG[state];
  const mem = formatMemory(workload.memory_bytes);
  const cpu = formatCPU(workload.cpu_millicores);

  const actionMut = useMutation({
    mutationFn: (action: "start" | "stop" | "restart") => {
      if (action === "start") return startServer("", workload.id, { namespaceSlug, environmentSlug });
      if (action === "stop") return stopServer("", workload.id, { namespaceSlug, environmentSlug });
      return restartServer("", workload.id, { namespaceSlug, environmentSlug });
    },
    onSuccess: (_, action) => {
      toast.success(
        action === "start" ? "Starting…" : action === "stop" ? "Stopping…" : "Restarting…"
      );
      void qc.invalidateQueries({ queryKey: ["workloads", namespaceSlug, environmentSlug] });
    },
    onError: () => toast.error("Action failed"),
  });

  const canStart = state === "stopped" || state === "failed";
  const canStop = state === "running" || state === "pending";
  const canRestart = state === "running";

  return (
    <motion.div
      drag
      dragMomentum={false}
      style={{ position: "absolute", x, y }}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => {
        setIsDragging(false);
        onDragEnd(workload.id, { x: x.get(), y: y.get() });
      }}
      className={cn(
        "w-52 rounded-2xl border border-white/[0.07] bg-[oklch(0.1_0.01_85_/_0.82)] backdrop-blur-xl select-none",
        cfg.glow,
        isDragging ? "cursor-grabbing z-50" : "cursor-grab z-10 hover:border-white/[0.12] hover:bg-[oklch(0.12_0.01_85_/_0.82)]",
        "transition-[border-color,background-color,box-shadow] duration-150"
      )}
      whileDrag={{ scale: 1.03, zIndex: 50 }}
    >
      {/* Drag handle / header */}
      <div className="flex items-center gap-2.5 px-3 pt-3 pb-2 border-b border-white/[0.05]">
        <Circle className={cn("size-2 shrink-0", cfg.dot)} />
        <p className="flex-1 text-[13px] font-semibold text-white/85 truncate">{workload.name}</p>
        <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide", cfg.badge)}>
          {cfg.label}
        </span>
      </div>

      {/* Endpoint / resources */}
      <div className="px-3 py-2 space-y-1">
        {workload.endpoint && (
          <p className="text-[10px] font-mono text-white/25 truncate">{workload.endpoint}</p>
        )}
        {(mem || cpu) && (
          <div className="flex items-center gap-3">
            {mem && <span className="text-[10px] text-white/30">{mem}</span>}
            {cpu && <span className="text-[10px] text-white/30">{cpu}</span>}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 px-3 pb-3">
        {canStart && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => actionMut.mutate("start")}
            disabled={actionMut.isPending}
            title="Start"
            className="flex size-7 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-40"
          >
            {actionMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
          </button>
        )}
        {canStop && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => actionMut.mutate("stop")}
            disabled={actionMut.isPending}
            title="Stop"
            className="flex size-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-colors disabled:opacity-40"
          >
            {actionMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <Square className="size-3" />}
          </button>
        )}
        {canRestart && (
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => actionMut.mutate("restart")}
            disabled={actionMut.isPending}
            title="Restart"
            className="flex size-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-colors disabled:opacity-40"
          >
            {actionMut.isPending ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Simple Canvas ──────────────────────────────────────────────────────────

export function SimpleCanvas({
  workloads,
  namespaceSlug,
  environmentSlug,
  onDeploy,
}: {
  workloads: WorkloadDTO[];
  namespaceSlug: string;
  environmentSlug: string;
  onDeploy: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const scope = `${namespaceSlug}/${environmentSlug}`;

  const [positions] = useState<Record<string, { x: number; y: number }>>(() => {
    const init: Record<string, { x: number; y: number }> = {};
    workloads.forEach((w, i) => {
      init[w.id] = loadPos(scope, w.id) ?? { x: 48 + (i % 4) * 228, y: 48 + Math.floor(i / 4) * 180 };
    });
    return init;
  });

  const handleDragEnd = useCallback((id: string, pos: { x: number; y: number }) => {
    savePos(scope, id, pos);
  }, [scope]);

  return (
    <div
      ref={canvasRef}
      className="relative h-full w-full overflow-hidden bg-dot-grid"
      style={{ background: "oklch(0.08 0.016 85)" }}
    >
      {/* dot grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(circle, oklch(0.35 0.02 85 / 0.45) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      {/* Ambient glow top-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 35% at 100% 0%, oklch(0.8 0.17 90 / 0.06), transparent 70%)",
        }}
      />

      {workloads.length === 0 ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur">
            <Globe className="size-6 text-white/20" />
          </div>
          <div>
            <p className="text-sm font-medium text-white/40">No servers yet</p>
            <p className="text-[12px] text-white/25 mt-1">Deploy your first server to see it here.</p>
          </div>
          <button
            onClick={onDeploy}
            className="flex items-center gap-1.5 h-8 px-4 rounded-lg bg-primary/10 border border-primary/20 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-all"
          >
            <Plus className="size-3.5" />
            Deploy server
          </button>
        </div>
      ) : (
        workloads.map((w, i) => (
          <ServerCard
            key={w.id}
            workload={w}
            namespaceSlug={namespaceSlug}
            environmentSlug={environmentSlug}
            initialPos={positions[w.id] ?? { x: 48 + (i % 4) * 228, y: 48 + Math.floor(i / 4) * 180 }}
            scope={scope}
            onDragEnd={handleDragEnd}
          />
        ))
      )}

      {/* Deploy FAB */}
      {workloads.length > 0 && (
        <button
          onClick={onDeploy}
          className="absolute bottom-6 right-6 flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-[12px] font-semibold text-black hover:opacity-90 transition-opacity shadow-[0_0_20px_oklch(0.80_0.17_90_/_0.25)]"
        >
          <Plus className="size-3.5" />
          Deploy
        </button>
      )}
    </div>
  );
}

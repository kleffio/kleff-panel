"use client";

import * as React from "react";
import {
  Activity,
  Cpu,
  FileText,
  HardDrive,
  MemoryStick,
  Play,
  RotateCcw,
  Square,
  Trash2,
  Wifi,
  Zap,
  ChevronsRight,
  CornerDownLeft,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getWorkload, deleteWorkload, restartWorkload, startWorkload, stopWorkload, type WorkloadDTO } from "@/lib/api/projects";
import { getProjectMetrics, type WorkloadMetricsDTO } from "@/lib/api/usage";
import { LogViewer } from "@/features/hosting/ui/LogViewer";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@kleffio/ui";

function fmt(n: number, d = 1) {
  return n.toFixed(d);
}

function memDisplay(mb: number): { value: string; unit: string } {
  if (mb >= 1000) return { value: fmt(mb / 1024, 2), unit: "GB" };
  return { value: fmt(mb), unit: "MB" };
}

function useUptime(createdAt: string | undefined) {
  const [elapsed, setElapsed] = React.useState(0);
  React.useEffect(() => {
    if (!createdAt) return;
    const start = new Date(createdAt).getTime();
    const tick = () => setElapsed(Math.max(0, Date.now() - start));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt]);
  const h = Math.floor(elapsed / 3_600_000);
  const m = Math.floor((elapsed % 3_600_000) / 60_000);
  const s = Math.floor((elapsed % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function inferKind(image: string, blueprintID: string) {
  const s = `${image} ${blueprintID}`.toLowerCase();
  if (/minecraft/.test(s)) return "minecraft";
  if (/postgres|mysql|mariadb|mongo/.test(s)) return "database";
  if (/redis|cache|memcached/.test(s)) return "cache";
  if (/proxy|traefik|envoy|nginx/.test(s)) return "proxy";
  if (/rust|ark|valheim|terraria|game/.test(s)) return "game";
  return "app";
}

// Removed static KIND_GRADIENT

function StatusChip({ state }: { state: WorkloadDTO["state"] | "starting" | "stopping" | "restarting" }) {
  if (state === "running")
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-400/20">
        <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
        Online
      </span>
    );
  if (state === "failed" || state === "stopped")
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-red-400/15 px-3 py-1 text-xs font-semibold text-red-400 ring-1 ring-red-400/20">
        <span className="size-1.5 rounded-full bg-red-400" />
        {state === "failed" ? "Failed" : "Stopped"}
      </span>
    );
  if (state === "stopping")
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-red-400/15 px-3 py-1 text-xs font-semibold text-red-400 ring-1 ring-red-400/20">
        <span className="size-1.5 rounded-full bg-red-400 animate-pulse" />
        Stopping…
      </span>
    );
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-400 ring-1 ring-amber-400/20">
      <span className="size-1.5 rounded-full bg-amber-400 animate-pulse" />
      {state === "restarting" ? "Restarting…" : "Starting…"}
    </span>
  );
}



export function ServerOverviewPage({
  projectID,
  workloadID,
}: {
  projectID: string;
  workloadID: string;
}) {
  const router = useRouter();
  const [workload, setWorkload] = React.useState<WorkloadDTO | null>(null);
  const [metrics, setMetrics] = React.useState<WorkloadMetricsDTO | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [optimisticState, setOptimisticState] = React.useState<"starting" | "stopping" | "restarting" | null>(null);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await deleteWorkload(projectID, workloadID);
      router.back();
    } catch {
      setIsDeleting(false);
    }
  }

  React.useEffect(() => {
    let cancelled = false;
    const fetch = () => {
      getWorkload(projectID, workloadID)
        .then((d) => { if (!cancelled) setWorkload(d); })
        .catch(() => {});
      getProjectMetrics(projectID)
        .then((res) => {
          if (cancelled) return;
          const found = res.workloads?.find((w) => w.workload_id === workloadID) ?? null;
          setMetrics(found);
        })
        .catch(() => {});
    };
    fetch();
    const id = setInterval(fetch, 10_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [projectID, workloadID]);

  // Auto-clear optimistic state if the backend state aligns
  React.useEffect(() => {
    if (!optimisticState || !workload) return;
    if (optimisticState === "starting" && workload.state === "running") setOptimisticState(null);
    if (optimisticState === "stopping" && (workload.state === "stopped" || workload.state === "failed")) setOptimisticState(null);
    if (optimisticState === "restarting" && workload.state === "running") {
      // It might take a second for the state to bounce, we'll rely on the timeout below to clear it if it doesn't change
    }
  }, [optimisticState, workload?.state]);

  // Timeout fallback to clear optimistic state
  React.useEffect(() => {
    if (!optimisticState) return;
    const t = setTimeout(() => setOptimisticState(null), 15000);
    return () => clearTimeout(t);
  }, [optimisticState]);

  const displayState = optimisticState || workload?.state;
  const isBusy = !!optimisticState || !workload;

  const uptime = useUptime(displayState === "running" ? workload?.created_at : undefined);



  const cpuLimitM =
    (metrics?.cpu_limit_millicores ?? 0) > 0
      ? metrics!.cpu_limit_millicores
      : workload?.cpu_millicores ?? 1000;
  const memLimitMB =
    (metrics?.memory_limit_bytes ?? 0) > 0
      ? metrics!.memory_limit_bytes / (1024 * 1024)
      : workload?.memory_bytes
        ? workload.memory_bytes / (1024 * 1024)
        : 2048;

  const hasMetrics = !!metrics;
  const cpuM = metrics ? Math.min(metrics.cpu_millicores, cpuLimitM) : 0;
  const memMB = metrics ? Math.min(metrics.memory_mb, memLimitMB) : 0;
  const memVal = hasMetrics ? memDisplay(memMB) : { value: "—", unit: "MB" };

  const metricCards = [
    {
      label: "CPU",
      value: hasMetrics ? fmt(cpuM / 1000, 2) : "—",
      unit: "cores",
      sub: hasMetrics ? `${fmt(cpuLimitM / 1000, 1)} core limit` : "no data",
      icon: Cpu,
      color: "text-orange-400",
      iconBg: "bg-orange-400/10",
      barColor: "bg-orange-400",
      pct: hasMetrics && cpuLimitM > 0 ? Math.min((cpuM / cpuLimitM) * 100, 100) : null,
    },
    {
      label: "Memory",
      value: memVal.value,
      unit: memVal.unit,
      sub: hasMetrics ? `of ${memDisplay(memLimitMB).value} ${memDisplay(memLimitMB).unit}` : "no data",
      icon: MemoryStick,
      color: "text-[#f5b517]",
      iconBg: "bg-[#f5b517]/10",
      barColor: "bg-[#f5b517]",
      pct: hasMetrics && memLimitMB > 0 ? Math.min((memMB / memLimitMB) * 100, 100) : null,
    },
    {
      label: "Network In",
      value: hasMetrics ? fmt(metrics!.network_in_kbps) : "—",
      unit: "KB/s",
      sub: hasMetrics ? `out: ${fmt(metrics!.network_out_kbps)} KB/s` : "no data",
      icon: Wifi,
      color: "text-emerald-400",
      iconBg: "bg-emerald-400/10",
      barColor: "",
      pct: null,
    },
    {
      label: "Disk I/O",
      value: hasMetrics ? fmt(metrics!.disk_read_kbps) : "—",
      unit: "KB/s read",
      sub: hasMetrics ? `write: ${fmt(metrics!.disk_write_kbps)} KB/s` : "no data",
      icon: HardDrive,
      color: "text-rose-400",
      iconBg: "bg-rose-400/10",
      barColor: "",
      pct: null,
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-5 p-6 animate-in fade-in duration-300">

        {/* Hero */}
        <div className="relative overflow-hidden rounded-xl border border-white/[0.07] bg-card shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
          {/* Smoothly transitioning gradients based on state */}
          <div className={`absolute inset-0 bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent transition-opacity duration-1000 ${displayState === "running" ? "opacity-100" : "opacity-0"}`} />
          <div className={`absolute inset-0 bg-gradient-to-br from-red-500/20 via-red-500/5 to-transparent transition-opacity duration-1000 ${["stopped", "failed", "stopping"].includes(displayState ?? "") ? "opacity-100" : "opacity-0"}`} />
          <div className={`absolute inset-0 bg-gradient-to-br from-amber-500/20 via-amber-500/5 to-transparent transition-opacity duration-1000 ${["starting", "restarting", "pending"].includes(displayState ?? "") ? "opacity-100" : "opacity-0"}`} />
          <div className={`absolute inset-0 bg-gradient-to-br from-[#f5b517]/20 via-[#f5b517]/5 to-transparent transition-opacity duration-1000 ${!displayState ? "opacity-100" : "opacity-0"}`} />
          {/* Subtle grid texture */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }} />

          <div className="relative p-6 sm:py-10 sm:px-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              {/* Identity */}
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  {displayState ? (
                    <StatusChip state={displayState} />
                  ) : (
                    <span className="h-6 w-20 animate-pulse rounded-full bg-white/[0.07]" />
                  )}
                  {displayState === "running" && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground/60">
                      <Zap className="size-3" />
                      {uptime}
                    </span>
                  )}
                </div>
                <h1 className="text-2xl font-bold tracking-tight">
                  {workload?.name ?? <span className="inline-block h-7 w-48 animate-pulse rounded bg-white/[0.07]" />}
                </h1>
                <p className="text-sm text-muted-foreground/50 font-mono">
                  {workload?.endpoint || workload?.id.slice(0, 16) || "—"}
                </p>
              </div>

              {/* Controls */}
              <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3 relative z-10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      setOptimisticState("starting");
                      try {
                        await startWorkload(projectID, workloadID);
                      } catch (e) {
                        setOptimisticState(null);
                        console.error("Failed to start", e);
                      }
                    }}
                    disabled={isBusy || displayState === "running"}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-white/[0.05] disabled:opacity-40"
                    title="Start Server"
                  >
                    <Play className="size-3.5 text-emerald-500" />
                    <span className="text-white/90">Start</span>
                  </button>
                  <button
                    onClick={async () => {
                      setOptimisticState("stopping");
                      try {
                        await stopWorkload(projectID, workloadID);
                      } catch (e) {
                        setOptimisticState(null);
                        console.error("Failed to stop", e);
                      }
                    }}
                    disabled={isBusy || displayState !== "running"}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-white/[0.05] disabled:opacity-40"
                    title="Stop Server"
                  >
                    <Square className="size-3.5 text-red-500" />
                    <span className="text-white/90">Stop</span>
                  </button>
                  <button
                    onClick={async () => {
                      setOptimisticState("restarting");
                      try {
                        await restartWorkload(projectID, workloadID);
                      } catch (e) {
                        setOptimisticState(null);
                        console.error("Failed to restart", e);
                      }
                    }}
                    disabled={isBusy}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-white/[0.05] disabled:opacity-40"
                    title="Restart Server"
                  >
                    <RotateCcw className="size-3.5 text-amber-500" />
                    <span className="text-white/90">Restart</span>
                  </button>
                </div>
                <div className="w-px h-5 bg-white/[0.08] mx-1" />
                <button
                  className="flex items-center gap-2 rounded-lg border border-white/[0.07] bg-card px-4 py-2 text-sm font-medium transition-colors hover:bg-white/[0.05] disabled:opacity-40"
                  disabled={isDeleting}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="size-3.5 text-red-500" />
                  <span className="text-white/90">Delete</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Logs and Metrics split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          
          {/* Logs (2/3 width, taller) */}
          <div className="lg:col-span-2 relative overflow-hidden rounded-xl border border-[#f5b517]/15 bg-[#090909] flex flex-col h-[620px] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(245,181,23,0.03)_inset]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(245,181,23,0.06),transparent)]" />
            <div className="relative border-b border-[#f5b517]/10 px-5 py-3 flex items-center gap-2 shrink-0">
              <div className="flex size-6 items-center justify-center rounded-md bg-[#f5b517]/10">
                <Activity className="size-3.5 text-[#f5b517]" />
              </div>
              <h2 className="text-sm font-semibold text-white/80">Logs</h2>
              <FileText className="size-3.5 text-white/20 ml-1" />
              <span className="text-xs text-white/25">live · 5 s poll</span>
            </div>
            <div className="flex-1 overflow-hidden">
              <LogViewer workloadId={workloadID} projectID={projectID} />
            </div>
            {/* Command Input Bar */}
            <div className="border-t border-[#f5b517]/10 bg-black/30 p-3 shrink-0">
              <div className="flex items-center gap-2 rounded-lg border border-[#f5b517]/10 bg-white/[0.02] px-3 py-2 transition-colors focus-within:border-[#f5b517]/25 focus-within:bg-[#f5b517]/[0.03]">
                <ChevronsRight className="size-4 shrink-0 text-[#f5b517]/30" />
                <input
                  type="text"
                  placeholder="Type a command..."
                  className="flex-1 bg-transparent text-sm text-white/90 placeholder:text-white/25 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      /* command execution logic TBD */
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                />
                <button
                  className="flex items-center justify-center rounded-md border border-[#f5b517]/15 bg-[#f5b517]/[0.06] p-1 text-[#f5b517]/40 hover:bg-[#f5b517]/[0.12] hover:text-[#f5b517]/80 transition-colors"
                  title="Send Command"
                >
                  <CornerDownLeft className="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Right Sidebar (1/3 width) */}
          <div className="flex flex-col gap-4 h-[620px]">
            
            {/* Server Details */}
            <div className="relative overflow-hidden rounded-xl border border-[#f5b517]/15 bg-[#090909] shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(245,181,23,0.03)_inset]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(245,181,23,0.06),transparent)]" />
              <div className="relative border-b border-[#f5b517]/10 px-4 py-3 flex items-center gap-2">
                <div className="flex size-5 items-center justify-center rounded-md bg-[#f5b517]/10">
                  <FileText className="size-3 text-[#f5b517]" />
                </div>
                <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Configuration</h3>
              </div>
              <div className="relative px-4 py-3 flex flex-col divide-y divide-[#f5b517]/[0.06]">
                {[
                  { label: "CPU Limit", value: `${fmt(cpuLimitM / 1000, 1)} cores` },
                  { label: "Memory Limit", value: `${memDisplay(memLimitMB).value} ${memDisplay(memLimitMB).unit}` },
                  { label: "Image", value: workload?.image?.split("/").pop() ?? "—" },
                  { label: "Server ID", value: workload?.id.slice(0, 12) ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-center py-2.5 text-sm">
                    <span className="text-white/35 font-medium">{label}</span>
                    <span className="font-mono text-xs font-semibold text-white/75 truncate pl-4">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Metrics */}
            <div className="relative overflow-hidden rounded-xl border border-[#f5b517]/15 bg-[#090909] flex flex-col flex-1 min-h-0 shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_0_1px_rgba(245,181,23,0.03)_inset]">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-[radial-gradient(80%_100%_at_50%_0%,rgba(245,181,23,0.06),transparent)]" />
              <div className="relative border-b border-[#f5b517]/10 px-4 py-3 flex items-center gap-2">
                <div className="flex size-5 items-center justify-center rounded-md bg-[#f5b517]/10">
                  <Zap className="size-3 text-[#f5b517]" />
                </div>
                <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Live Usage</h3>
                {hasMetrics && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] text-white/20">
                    <span className="size-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
                    live
                  </span>
                )}
              </div>
              <div className="relative px-4 py-3 flex flex-col gap-4">
                {metricCards.map((m) => (
                  <div key={m.label} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className={`flex size-5 items-center justify-center rounded-md ${m.iconBg}`}>
                          <m.icon className={`size-3 ${m.color}`} />
                        </div>
                        <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">{m.label}</span>
                      </div>
                      <span className="text-sm font-bold text-white/85 tracking-tight tabular-nums">
                        {m.value}<span className={`ml-1 text-[10px] font-normal ${m.color} opacity-70`}>{m.unit}</span>
                      </span>
                    </div>
                    {m.pct !== null ? (
                      <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${m.barColor} transition-all duration-700`}
                          style={{ width: `${m.pct}%` }}
                        />
                      </div>
                    ) : (
                      <div className="h-1 rounded-full bg-white/[0.04]" />
                    )}
                    <span className="text-[10px] text-white/20">{m.sub}</span>
                  </div>
                ))}
              </div>
            </div>
            
          </div>

        </div>


      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete server?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong className="text-white/80">{workload?.name ?? "This server"}</strong> will be permanently deleted.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isDeleting}
              onClick={handleDelete}
              className="bg-red-500/90 text-white hover:bg-red-500 border-red-400/30"
            >
              {isDeleting ? "Deleting…" : "Delete server"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

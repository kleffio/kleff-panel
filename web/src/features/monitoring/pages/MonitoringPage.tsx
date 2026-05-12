"use client";

import * as React from "react";
import { Activity, BarChart2, Cpu, HardDrive, MemoryStick, RefreshCw, Wifi } from "lucide-react";
import { getProjectMetrics, type WorkloadMetricsDTO } from "@/lib/api/usage";
import { useCurrentProject } from "@/features/projects/model/CurrentProjectProvider";
import { PluginSlot } from "@/features/plugins/ui/PluginSlot";

const POLL_INTERVAL_MS = 30_000;

function fmt(n: number, decimals = 1) {
  return n.toFixed(decimals);
}

function cpuCores(millicores: number) {
  return fmt(millicores / 1000, 2);
}

function memDisplay(mb: number): { value: string; unit: string; sub: string } {
  if (mb >= 1000) {
    return { value: fmt(mb / 1024, 2), unit: "GB", sub: `${fmt(mb)} MB` };
  }
  return { value: fmt(mb), unit: "MB", sub: `${fmt(mb / 1024, 2)} GB` };
}

export function MonitoringPage() {
  const { currentProjectID } = useCurrentProject();
  const [workloads, setWorkloads] = React.useState<WorkloadMetricsDTO[]>([]);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const fetchMetrics = React.useCallback(async () => {
    if (!currentProjectID) return;
    try {
      const data = await getProjectMetrics(currentProjectID);
      setWorkloads(data.workloads ?? []);
      setLastUpdated(new Date());
      setError(null);
    } catch {
      setError("Failed to fetch metrics");
    } finally {
      setLoading(false);
    }
  }, [currentProjectID]);

  React.useEffect(() => {
    setLoading(true);
    fetchMetrics();
    const id = setInterval(fetchMetrics, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchMetrics]);

  // Aggregate totals across all workloads
  const totals = React.useMemo(() => {
    return workloads.reduce(
      (acc, w) => {
        const cpuM = w.cpu_limit_millicores > 0 ? Math.min(w.cpu_millicores, w.cpu_limit_millicores) : w.cpu_millicores;
        const memLimitMB = w.memory_limit_bytes > 0 ? w.memory_limit_bytes / (1024 * 1024) : Infinity;
        const memMB = w.memory_limit_bytes > 0 ? Math.min(w.memory_mb, memLimitMB) : w.memory_mb;
        return {
          cpuMillicores: acc.cpuMillicores + cpuM,
          memoryMB: acc.memoryMB + memMB,
          networkInKbps: acc.networkInKbps + w.network_in_kbps,
          networkOutKbps: acc.networkOutKbps + w.network_out_kbps,
          diskReadKbps: acc.diskReadKbps + w.disk_read_kbps,
          diskWriteKbps: acc.diskWriteKbps + w.disk_write_kbps,
        };
      },
      { cpuMillicores: 0, memoryMB: 0, networkInKbps: 0, networkOutKbps: 0, diskReadKbps: 0, diskWriteKbps: 0 }
    );
  }, [workloads]);

  const hasData = workloads.length > 0;

  const metricCards = [
    {
      label: "CPU Usage",
      value: hasData ? cpuCores(totals.cpuMillicores) : "—",
      unit: "cores",
      sub: hasData ? `${cpuCores(totals.cpuMillicores)} cores total` : "no data",
      icon: Cpu,
    },
    {
      label: "Memory",
      ...(hasData ? memDisplay(totals.memoryMB) : { value: "—", unit: "MB", sub: "no data" }),
      icon: MemoryStick,
    },
    {
      label: "Network In",
      value: hasData ? fmt(totals.networkInKbps) : "—",
      unit: "KB/s",
      sub: hasData ? `out: ${fmt(totals.networkOutKbps)} KB/s` : "no data",
      icon: Wifi,
    },
    {
      label: "Disk I/O",
      value: hasData ? fmt(totals.diskReadKbps) : "—",
      unit: "KB/s read",
      sub: hasData ? `write: ${fmt(totals.diskWriteKbps)} KB/s` : "no data",
      icon: HardDrive,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-500">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Monitoring</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time metrics for your environment workloads.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground/50">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => { fetchMetrics(); setRefreshKey((k) => k + 1); }}
            className="flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-xs text-muted-foreground hover:bg-white/[0.08] transition-colors"
          >
            <RefreshCw className="size-3" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metric cards — only when there is data */}
      {!loading && !error && hasData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((m) => (
            <div
              key={m.label}
              className="rounded-xl border border-white/[0.07] bg-card p-5 flex flex-col gap-3 shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{m.label}</p>
                <span className="flex size-7 items-center justify-center rounded-md bg-white/[0.04]">
                  <m.icon className="size-4 text-muted-foreground/50" />
                </span>
              </div>
              <p className="text-3xl font-semibold tracking-tight">
                {m.value}
                {m.value !== "—" && (
                  <span className="text-lg font-normal text-muted-foreground ml-1">{m.unit}</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground/40">{m.sub}</p>
            </div>
          ))}
        </div>
      )}

      {!loading && workloads.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-32">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/[0.06]">
            <BarChart2 className="size-6 text-muted-foreground/60" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No metrics yet</p>
          <p className="text-xs text-muted-foreground/60 max-w-xs text-center">Start a workload and metrics will appear here within 30 seconds.</p>
        </div>
      ) : (
        <>
          {/* Plugin-injected charts (e.g. Prometheus time-series) */}
          <PluginSlot name="monitoring.charts" slotProps={{ projectId: currentProjectID, refreshKey }} />

          {/* Per-workload table */}
          <div className="rounded-xl border border-white/[0.07] bg-card overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
            <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                Workload Metrics
              </h2>
              <span className="text-xs text-muted-foreground/50">{workloads.length} workload{workloads.length !== 1 ? "s" : ""}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/[0.05] text-xs text-muted-foreground/50">
                    <th className="px-6 py-3 text-left font-medium">Workload</th>
                    <th className="px-4 py-3 text-right font-medium">CPU (cores)</th>
                    <th className="px-4 py-3 text-right font-medium">Memory</th>
                    <th className="px-4 py-3 text-right font-medium">Net In</th>
                    <th className="px-4 py-3 text-right font-medium">Net Out</th>
                    <th className="px-4 py-3 text-right font-medium">Disk R</th>
                    <th className="px-4 py-3 text-right font-medium">Disk W</th>
                    <th className="px-4 py-3 text-right font-medium">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {workloads.map((w) => {
                    const cpuM = w.cpu_limit_millicores > 0 ? Math.min(w.cpu_millicores, w.cpu_limit_millicores) : w.cpu_millicores;
                    const memLimitMB = w.memory_limit_bytes > 0 ? w.memory_limit_bytes / (1024 * 1024) : Infinity;
                    const memMB = w.memory_limit_bytes > 0 ? Math.min(w.memory_mb, memLimitMB) : w.memory_mb;
                    return (
                      <tr key={w.workload_id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-6 py-3 text-xs text-foreground/60">
                          {w.workload_name || w.workload_id.slice(0, 8) + "…"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {cpuCores(cpuM)}
                          <span className="text-muted-foreground/40 ml-1 text-xs">cores</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {(() => { const m = memDisplay(memMB); return <>{m.value} <span className="text-muted-foreground/40 text-xs">{m.unit}</span></>; })()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmt(w.network_in_kbps)} <span className="text-muted-foreground/40 text-xs">KB/s</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmt(w.network_out_kbps)} <span className="text-muted-foreground/40 text-xs">KB/s</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmt(w.disk_read_kbps)} <span className="text-muted-foreground/40 text-xs">KB/s</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {fmt(w.disk_write_kbps)} <span className="text-muted-foreground/40 text-xs">KB/s</span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground/40">
                          {new Date(w.recorded_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

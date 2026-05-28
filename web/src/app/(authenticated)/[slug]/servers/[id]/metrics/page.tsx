"use client";

import { useEffect, useState, useRef } from "react";
import { Cpu, HardDrive, MemoryStick, Wifi, Zap } from "lucide-react";
import { PluginSlot } from "@/features/plugins/ui/PluginSlot";
import { getProjectMetrics, type WorkloadMetricsDTO } from "@/lib/api/usage";
import { useServerContext } from "../_hooks/useServerContext";

function fmt(n: number, d = 1) {
  return n.toFixed(d);
}

function memStr(mb: number) {
  return mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;
}

const STAT_CONFIGS = [
  {
    key: "cpu",
    label: "CPU",
    icon: Cpu,
    color: "text-orange-400",
    bg: "bg-orange-400/10",
    glow: "rgba(251,146,60,0.12)",
    border: "rgba(251,146,60,0.15)",
  },
  {
    key: "memory",
    label: "Memory",
    icon: MemoryStick,
    color: "text-[#f5b517]",
    bg: "bg-[#f5b517]/10",
    glow: "rgba(245,181,23,0.12)",
    border: "rgba(245,181,23,0.15)",
  },
  {
    key: "network",
    label: "Network In",
    icon: Wifi,
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    glow: "rgba(52,211,153,0.12)",
    border: "rgba(52,211,153,0.15)",
  },
  {
    key: "disk",
    label: "Disk Read",
    icon: HardDrive,
    color: "text-rose-400",
    bg: "bg-rose-400/10",
    glow: "rgba(251,113,133,0.12)",
    border: "rgba(251,113,133,0.15)",
  },
] as const;

function StatCard({
  config,
  value,
  unit,
  sub,
  pct,
  live,
}: {
  config: (typeof STAT_CONFIGS)[number];
  value: string;
  unit: string;
  sub: string;
  pct: number | null;
  live: boolean;
}) {
  const Icon = config.icon;
  return (
    <div
      className="relative overflow-hidden rounded-xl p-4 flex flex-col gap-3"
      style={{
        background: "#0a0a0a",
        border: `1px solid ${config.border}`,
        boxShadow: `0 0 0 1px ${config.glow} inset, 0 8px 24px rgba(0,0,0,0.4)`,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-60"
        style={{ background: `radial-gradient(80% 100% at 50% 0%, ${config.glow}, transparent)` }}
      />
      <div className="relative flex items-center justify-between">
        <div className={`flex size-7 items-center justify-center rounded-lg ${config.bg}`}>
          <Icon className={`size-3.5 ${config.color}`} />
        </div>
        {live && (
          <span className="flex items-center gap-1 text-[10px] text-white/25">
            <span className="size-1.5 rounded-full bg-emerald-400/60 animate-pulse" />
            live
          </span>
        )}
      </div>
      <div className="relative">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-white/35 mb-1">
          {config.label}
        </p>
        <p className="text-2xl font-bold tabular-nums text-white/90 leading-none">
          {value}
          <span className={`ml-1.5 text-sm font-normal ${config.color} opacity-70`}>{unit}</span>
        </p>
        <p className="mt-1.5 text-[11px] text-white/30">{sub}</p>
      </div>
      {pct !== null && (
        <div className="relative">
          <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width: `${pct}%`,
                background: `linear-gradient(90deg, ${config.glow.replace("0.12", "0.6")}, ${config.glow.replace("0.12", "1")})`,
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-white/20">{pct.toFixed(0)}% of limit</p>
        </div>
      )}
    </div>
  );
}

export default function ServerMetricsPage() {
  const { nsScope, workloadID } = useServerContext();
  const [metrics, setMetrics] = useState<WorkloadMetricsDTO | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      getProjectMetrics("", nsScope)
        .then((res) => {
          if (cancelled) return;
          const found = res.workloads?.find((w) => w.workload_id === workloadID) ?? null;
          setMetrics(found);
          setRefreshKey((k) => k + 1);
        })
        .catch(() => {});
    };
    poll();
    timerRef.current = setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [nsScope.namespaceSlug, workloadID]);

  const has = !!metrics;
  const cpuLimitM = (metrics?.cpu_limit_millicores ?? 0) > 0 ? metrics!.cpu_limit_millicores : 1000;
  const memLimitMB = (metrics?.memory_limit_bytes ?? 0) > 0
    ? metrics!.memory_limit_bytes / (1024 * 1024)
    : 2048;
  const cpuM = has ? Math.min(metrics!.cpu_millicores, cpuLimitM) : 0;
  const memMB = has ? Math.min(metrics!.memory_mb, memLimitMB) : 0;

  const stats = [
    {
      config: STAT_CONFIGS[0],
      value: has ? fmt(cpuM / 1000, 2) : "—",
      unit: "cores",
      sub: has ? `limit: ${fmt(cpuLimitM / 1000, 1)} cores` : "no data",
      pct: has && cpuLimitM > 0 ? Math.min((cpuM / cpuLimitM) * 100, 100) : null,
    },
    {
      config: STAT_CONFIGS[1],
      value: has ? memStr(memMB) : "—",
      unit: "",
      sub: has ? `of ${memStr(memLimitMB)}` : "no data",
      pct: has && memLimitMB > 0 ? Math.min((memMB / memLimitMB) * 100, 100) : null,
    },
    {
      config: STAT_CONFIGS[2],
      value: has ? fmt(metrics!.network_in_kbps) : "—",
      unit: "KB/s",
      sub: has ? `out: ${fmt(metrics!.network_out_kbps)} KB/s` : "no data",
      pct: null,
    },
    {
      config: STAT_CONFIGS[3],
      value: has ? fmt(metrics!.disk_read_kbps) : "—",
      unit: "KB/s",
      sub: has ? `write: ${fmt(metrics!.disk_write_kbps)} KB/s` : "no data",
      pct: null,
    },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white/90">Monitoring</h2>
            <p className="text-xs text-white/35 mt-0.5">Live resource usage · updates every 10 s</p>
          </div>
          {metrics && (
            <div className="flex items-center gap-1.5 text-[11px] text-white/25">
              <Zap className="size-3" />
              {new Date(metrics.recorded_at).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* KPI stat cards */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((s) => (
            <StatCard key={s.config.key} {...s} live={has} />
          ))}
        </div>

        {/* Plugin time-series charts */}
        <PluginSlot
          name="monitoring.charts"
          slotProps={{ workloadId: workloadID, namespaceSlug: nsScope.namespaceSlug, refreshKey, compact: false }}
        />

      </div>
    </div>
  );
}
